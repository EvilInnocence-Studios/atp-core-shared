import { ISettingContainer } from "@common/lib/setting/types";
import { ItemType, MenuItemType } from "antd/es/menu/interface"
import { merge } from "lodash";

export declare interface IRoute {
    path: string;
    component: React.ComponentType<any>;
}

export declare type AppType = "admin" | "public";

export declare interface IModule {
    name: string;
    menus?: {
        admin?: ItemType<MenuItemType>[];
        public?: ItemType<MenuItemType>[];
    };
    routes?: {
        admin?: IRoute[];
        public?: IRoute[];
    };
    settings?: ISettingContainer;
    plugins?: {
        register?: () => void;
    }
}

export const getMenus = (modules: IModule[], type:AppType) => {
    return modules.reduce((acc, module) => {
        if (module.menus && module.menus[type]) {
            acc.push(...module.menus[type]);
        }
        return acc;
    }, [] as ItemType<MenuItemType>[]);
}

export const getRoutes = (modules: IModule[], type:AppType) => {
    return modules.reduce((acc, module) => {
        if (module.routes && module.routes[type]) {
            acc.push(...module.routes[type]);
        }
        return acc;
    }, [] as IRoute[]);
}

export const getSettings = (modules: IModule[]) => {
    return modules.reduce((acc, module) => {
        if (module.settings) {
            return merge(acc, module.settings);
        }
        return acc;
    }, {} as ISettingContainer);
}

export const registerPlugins = (modules: IModule[]) => {
    modules.forEach(module => {
        if (module.plugins && module.plugins.register) {
            module.plugins.register();
        }
    });
}
