import { ACMClient, DescribeCertificateCommand, ListCertificatesCommand } from '@aws-sdk/client-acm';
import {
    CacheBehavior,
    CloudFrontClient,
    CreateDistributionCommand,
    DefaultCacheBehavior,
    DistributionConfig,
    GetDistributionConfigCommand,
    ListCachePoliciesCommand,
    ListOriginRequestPoliciesCommand,
    ListResponseHeadersPoliciesCommand,
    Origin,
    UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import 'dotenv/config';
// Add Node utils for directory scanning and dynamic import resolution
import { fromEnv } from '@aws-sdk/credential-providers';
let caching: any[] = [];
try {
    // @ts-ignore
    const cachingModule = await import("../../caching.config.js");
    caching = cachingModule.caching || [];
} catch (e) {
    // console.log("No caching.config found, using default empty caching behaviors.");
}

export declare interface IBehavior {
    precedence: number;
    pathPattern: string;
    cache: boolean;
}

// Helpers to resolve managed policy IDs by name (case-insensitive, ignore non-alphanumerics)
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function findManagedCachePolicyId(client: CloudFrontClient, name: string): Promise<string> {
    const res = await client.send(new ListCachePoliciesCommand({ Type: 'managed' }));
    const target = normalize(name);
    const match = res.CachePolicyList?.Items?.find(
        i => i.CachePolicy?.CachePolicyConfig?.Name && normalize(i.CachePolicy.CachePolicyConfig.Name) === target
    )?.CachePolicy?.Id;
    if (!match) throw new Error(`Managed cache policy not found: ${name}`);
    return match;
}

async function findManagedOriginRequestPolicyId(client: CloudFrontClient, name: string): Promise<string> {
    const res = await client.send(new ListOriginRequestPoliciesCommand({ Type: 'managed' }));
    const target = normalize(name);
    const match = res.OriginRequestPolicyList?.Items?.find(
        i => i.OriginRequestPolicy?.OriginRequestPolicyConfig?.Name && normalize(i.OriginRequestPolicy.OriginRequestPolicyConfig.Name) === target
    )?.OriginRequestPolicy?.Id;
    if (!match) throw new Error(`Managed origin request policy not found: ${name}`);
    return match;
}

async function findManagedResponseHeadersPolicyId(client: CloudFrontClient, name: string): Promise<string> {
    const res = await client.send(new ListResponseHeadersPoliciesCommand({ Type: 'managed' }));
    const target = normalize(name);
    const match = res.ResponseHeadersPolicyList?.Items?.find(
        i => i.ResponseHeadersPolicy?.ResponseHeadersPolicyConfig?.Name && normalize(i.ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name) === target
    )?.ResponseHeadersPolicy?.Id;
    if (!match) throw new Error(`Managed response headers policy not found: ${name}`);
    return match;
}

async function findCertificateArnByName(certificateName: string): Promise<{ arn?: string, status?: string }> {
    if (!certificateName) return {};

    const acm = new ACMClient({ region: 'us-east-1', credentials: fromEnv() });
    const target = certificateName.toLowerCase();

    const matches = (host: string | undefined, pattern: string | undefined) => {
        if (!host || !pattern) return false;
        const h = host.toLowerCase();
        const p = pattern.toLowerCase();
        if (h === p) return true;
        if (p.startsWith('*.')) {
            const base = p.slice(2);
            return h === base || h.endsWith(`.${base}`);
        }
        return false;
    };

    // Pass 1: try to match summaries by DomainName to avoid extra API calls
    let nextToken: string | undefined = undefined;
    const candidateArns: string[] = [];
    do {
        const res:any = await acm.send(new ListCertificatesCommand({ NextToken: nextToken }));
        for (const s of res.CertificateSummaryList ?? []) {
            const arn = s.CertificateArn;
            const domain = s.DomainName;
            if (arn) candidateArns.push(arn);
            if (matches(target, domain) && arn) {
                // We still need to check status, so we continue to Pass 2
                // unless we want to call describe here. Let's stick to Pass 2 for simplicity.
            }
        }
        nextToken = res.NextToken;
    } while (nextToken);

    // Pass 2: describe each candidate
    for (const arn of candidateArns) {
        try {
            const res = await acm.send(new DescribeCertificateCommand({ CertificateArn: arn }));
            const cert = res.Certificate;
            if (!cert) continue;

            const names = new Set<string>();
            if (cert.DomainName) names.add(cert.DomainName);
            for (const san of cert.SubjectAlternativeNames ?? []) {
                if (san) names.add(san);
            }

            let anyMatch = false;
            for (const n of names) {
                if (matches(target, n)) {
                    anyMatch = true;
                    break;
                }
            }

            if (anyMatch) {
                return { arn, status: cert.Status };
            }
        } catch {
            // ignore describe failures and continue
        }
    }

    return {};
}

const createCloudFrontDistribution = async (): Promise<string> => {
    const cloudFront = new CloudFrontClient({ region: 'us-east-1', credentials: fromEnv() });

    const getEnv = (k: string) => process.env[k]?.trim() || undefined;
    const alternateDomainNames =
        getEnv('ALTERNATE_DOMAIN_NAMES')
            ?.split(',')
            .map(s => s.trim())
            .filter(Boolean) ?? [];
    const certificateName = getEnv('CERTIFICATE_NAME');
    const distributionId = getEnv('CLOUDFRONT_DISTRIBUTION_ID');
    const s3Bucket = getEnv('AWS_BUCKET');
    const originDomainName = getEnv('ORIGIN_DOMAIN_NAME') || getEnv('CF_ORIGIN_DOMAIN_NAME');

    if (!s3Bucket && !originDomainName) {
        throw new Error('Missing either AWS_BUCKET or ORIGIN_DOMAIN_NAME/CF_ORIGIN_DOMAIN_NAME in environment');
    }

    // Resolve required managed policy IDs
    const [
        responseHeadersPolicyId,
        cachePolicyDisabledId,
        originRequestAllExceptHostId,
        cachePolicyOptimizedId,
    ] = await Promise.all([
        // "Managed CORS with Preflight" (spaces or hyphens handled by normalize)
        findManagedResponseHeadersPolicyId(cloudFront, 'Managed CORS with Preflight'),
        findManagedCachePolicyId(cloudFront, 'Managed-CachingDisabled'),
        findManagedOriginRequestPolicyId(cloudFront, 'Managed-AllViewerExceptHostHeader'),
        // Used for cached endpoints
        findManagedCachePolicyId(cloudFront, 'Managed-CachingOptimized'),
    ]);

    const origins: Origin[] = [];
    if (s3Bucket) {
        console.log(`Configuring S3 origin for bucket: ${s3Bucket}`);
        origins.push({
            Id: 'S3Origin',
            DomainName: `${s3Bucket}.s3.amazonaws.com`,
            S3OriginConfig: {
                OriginAccessIdentity: '' // Public bucket or using OAC (handled separately if needed)
            }
        });
    } else {
        console.log(`Configuring Lambda origin: ${originDomainName}`);
        origins.push({
            Id: 'LambdaOrigin',
            DomainName: originDomainName!,
            CustomOriginConfig: {
                OriginProtocolPolicy: 'https-only',
                HTTPPort: 80,
                HTTPSPort: 443,
            },
        });
    }

    const defaultCacheBehavior: DefaultCacheBehavior = {
        TargetOriginId: s3Bucket ? 'S3Origin' : 'LambdaOrigin',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD'],
            CachedMethods: {
                Quantity: 2,
                Items: ['GET', 'HEAD'],
            },
        },
        CachePolicyId: cachePolicyDisabledId,
        OriginRequestPolicyId: originRequestAllExceptHostId,
        ResponseHeadersPolicyId: responseHeadersPolicyId,
    };

    const cacheBehaviors: CacheBehavior[] = (caching).map(behavior => ({
        PathPattern: behavior.pathPattern,
        TargetOriginId: s3Bucket ? 'S3Origin' : 'LambdaOrigin',
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: {
            Quantity: 3,
            Items: ['GET', 'HEAD', 'OPTIONS'],
            CachedMethods: {
                Quantity: 3,
                Items: ['GET', 'HEAD', 'OPTIONS'],
            },
        },
        ResponseHeadersPolicyId: responseHeadersPolicyId,
        CachePolicyId: behavior.cache ? cachePolicyOptimizedId : cachePolicyDisabledId,
        OriginRequestPolicyId: originRequestAllExceptHostId,
    }));

    const distributionConfig: DistributionConfig = {
        CallerReference: distributionId ? undefined : `${Date.now()}`,
        Origins: {
            Quantity: origins.length,
            Items: origins,
        },
        DefaultCacheBehavior: defaultCacheBehavior,
        CacheBehaviors: {
            Quantity: cacheBehaviors.length,
            Items: cacheBehaviors,
        },
        Enabled: true,
        Comment: `Created by createCloudFrontDistribution function for ${s3Bucket ? 'S3' : 'Lambda'}`,
        DefaultRootObject: s3Bucket ? 'index.html' : undefined
    };

    // Resolve ACM certificate logic
    let certInfo: { arn?: string; status?: string } = { arn: undefined, status: undefined };
    if (certificateName) {
        certInfo = await findCertificateArnByName(certificateName);
    }

    if (certInfo.arn && certInfo.status === 'ISSUED') {
        console.log(`Using custom certificate: ${certInfo.arn}`);
        distributionConfig.ViewerCertificate = {
            ACMCertificateArn: certInfo.arn,
            SSLSupportMethod: 'sni-only',
            MinimumProtocolVersion: 'TLSv1.2_2019',
        };
        // Add aliases only if we have a valid custom cert
        if (alternateDomainNames.length > 0) {
            distributionConfig.Aliases = {
                Quantity: alternateDomainNames.length,
                Items: alternateDomainNames,
            };
        }
    } else {
        if (certInfo.arn) {
            console.warn(`Certificate found with status ${certInfo.status}. Falling back to default CloudFront certificate.`);
        } else {
            console.log("Using default CloudFront certificate (Custom cert not found)");
        }
        distributionConfig.ViewerCertificate = {
            CloudFrontDefaultCertificate: true
        };
        // Omit aliases if using default cert to avoid InvalidViewerCertificate error
        distributionConfig.Aliases = {
            Quantity: 0,
            Items: []
        };
    }

    if (distributionId) {
        console.log(`Updating existing distribution: ${distributionId}`);
        const { DistributionConfig, ETag } = await cloudFront.send(new GetDistributionConfigCommand({ Id: distributionId }));
        
        // Merge configs: update only the fields we care about
        const updateParams = {
            Id: distributionId,
            IfMatch: ETag,
            DistributionConfig: {
                ...DistributionConfig,
                ...distributionConfig,
                CallerReference: DistributionConfig?.CallerReference // Keep original reference
            }
        };

        const response = await cloudFront.send(new UpdateDistributionCommand(updateParams));
        if (!response.Distribution || !response.Distribution.Id) {
            throw new Error('Failed to update CloudFront distribution');
        }
        return response.Distribution.Id;
    } else {
        console.log("Creating new distribution...");
        const command = new CreateDistributionCommand({ DistributionConfig: distributionConfig });
        const response = await cloudFront.send(command);

        if (!response.Distribution || !response.Distribution.Id) {
            throw new Error('Failed to create CloudFront distribution');
        }
        return response.Distribution.Id;
    }
};

createCloudFrontDistribution().then(id => {
    console.log(`DISTRIBUTION_ID=${id}`);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
