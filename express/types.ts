import { Index } from "ts-functional/dist/types";

export type NewObj<T extends {id:string}> = Omit<T, "id">;

export declare type Headers = Index<string>;

export type Params = Index<string>;
export type QuerySingleValue = string | number | boolean | null;
export type QueryArrayValue = string[] | number[] | boolean[] | null[];
export type QueryValue = QuerySingleValue | QueryArrayValue;
export type Query = Paging & Index<QueryValue>;
export declare type Paging = {offset?:number, perPage?:number};
