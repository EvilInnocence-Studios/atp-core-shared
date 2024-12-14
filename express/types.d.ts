import { IncomingHttpHeaders } from "http";
import { Index } from "ts-functional/dist/types";

export type NewObj<T extends {id:number}> = Omit<T, "id">;

export declare type Headers = Index<string>;

export declare type Params = Index<string>;
export declare type Query = Paging & Index<string | string[]>;
