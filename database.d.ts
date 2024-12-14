export declare interface IMigration {
    down: () => Promise<any>;
    up: () => Promise<any>;
}

export declare interface IInitializer {
    init:IMigration;
}


export declare type Update<T extends {id: number;}> = Partial<Omit<T, "id">>;

export declare interface ISearchQuery {
    q: string;
    perPage: number;
    offset: number;
}
