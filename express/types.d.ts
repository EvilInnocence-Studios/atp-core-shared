import { IncomingHttpHeaders } from "http";
import { Index } from "ts-functional/dist/types";

export type NewObj<T extends {id:number}> = Omit<T, "id">;

export declare type   HandlerFunction<Body = {}, Response = Body> = (params:Params, query:Body, headers: IncomingHttpHeaders, env:NodeJS.ProcessEnv) => Promise<Response>;

export type HandlerArgs<Body> = [Params, Body, IncomingHttpHeaders, NodeJS.ProcessEnv];

export declare type    GetFunction<T> = HandlerFunction<Query, T>;
export declare type   PostFunction<T, Body = Partial<T>> = HandlerFunction<Body, T>;
export declare type    PutFunction<T> = HandlerFunction<Partial<T>, T>;
export declare type  PatchFunction<T, Body = Partial<T>> = HandlerFunction<Body, T>;
export declare type DeleteFunction    = HandlerFunction<undefined, null>;

export declare type Headers = Index<string>;
