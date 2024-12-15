import { Index } from "ts-functional/dist/types";

export type NewObj<T extends {id:number}> = Omit<T, "id">;

export declare type Headers = Index<string>;

export type Params = Index<string>;
export type Query = Paging & Index<string | string[]>;
export declare type Paging = {offset?:number, perPage?:number};
