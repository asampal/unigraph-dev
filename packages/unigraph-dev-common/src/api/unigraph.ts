// FIXME: This file is ambiguous in purpose! Move utils to utils folder and keep this a small interface with a window object.

import { typeMap } from '../types/consts'
import { SchemaDgraph } from '../types/json-ts';
import { PackageDeclaration } from '../types/packages';
import { base64ToBlob } from '../utils/utils';

export interface Unigraph {
    backendConnection: WebSocket | false;
    backendMessages: string[];
    eventTarget: EventTarget;
    getStatus(): Promise<any>;
    createSchema(schema: any): Promise<any>;
    ensureSchema(name: string, fallback: any): Promise<any>;
    ensurePackage(packageName: string, fallback: PackageDeclaration): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/ban-types
    subscribeToType(name: string, callback: Function, eventId: number | undefined): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/ban-types
    subscribeToObject(uid: string, callback: Function, eventId: number | undefined): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/ban-types
    subscribeToQuery(fragment: string, callback: Function, eventId: number | undefined): Promise<any>;
    unsubscribe(id: number): any;
    addObject(object: any, schema: string): any;
    getType(name: string): any;
    getQueries(fragments: string[]): any;
    deleteObject(uid: string): any;
    updateSimpleObject(object: any, predicate: string, value: any): any;
    updateObject(uid: string, newObject: any): any;
    getReferenceables(): Promise<any>;
    getReferenceables(key: string | undefined, asMapWithContent: boolean | undefined): Promise<any>;
    getSchemas(schemas: string[] | undefined, resolve?: boolean): Promise<Map<string, SchemaDgraph>>;
    getPackages(packages: string[] | undefined): Promise<Map<string, PackageDeclaration>>;
    proxyFetch(url: string, options?: Record<string, any>): Promise<Blob>;
    buildGraph(objects: any[]): any[];
    importObjects(objects: any[]|string): Promise<any>;
    runExecutable<T>(unigraphid: string, params: T): Promise<any>;
    
}

/**
 * Implement a graph-like data structure based on js pointers from uid references.
 * 
 * Since pointers are not serializable, this must be done on the client side.
 * 
 * @param objects Objects with uid references
 */
export function buildGraph(objects: any[]): any[] {

    const objs: any[] = JSON.parse(JSON.stringify(objects))
    const dict: any = {}
    objs.forEach(object => {if (object.uid) dict[object.uid] = object})

    function buildGraphRecurse(obj: any) {
        if (typeof obj === "object" && Array.isArray(obj)) {
            obj.forEach((val, index) => {
                if(val.uid && dict[val.uid]) obj[index] = dict[val.uid];
                buildGraphRecurse(val)
            })
        } else if (typeof obj === "object") {
            Object.entries(obj).forEach(([key, value]: [key: string, value: any]) => {
                if(value.uid && dict[value.uid]) obj[key] = dict[value.uid];
                buildGraphRecurse(value)
            })
        }
    }

    objs.forEach(object => buildGraphRecurse(object))

    return objs

}

export function getRandomInt() {return Math.floor(Math.random() * Math.floor(1000000))}

export default function unigraph(url: string): Unigraph {
    const connection = new WebSocket(url);
    const messages: any[] = [];
    const eventTarget: EventTarget = new EventTarget();
    // eslint-disable-next-line @typescript-eslint/ban-types
    const callbacks: Record<string, Function> = {};
    // eslint-disable-next-line @typescript-eslint/ban-types
    const subscriptions: Record<string, Function> = {};

    function sendEvent(conn: WebSocket, name: string, params: any, id?: number | undefined) {
        if (!id) id = getRandomInt();
        conn.send(JSON.stringify({
            "type": "event",
            "event": name,
            "id": id,
            ...params
        }))
    }

    connection.onmessage = (ev) => {
        try {
            const parsed = JSON.parse(ev.data);
            messages.push(parsed);
            eventTarget.dispatchEvent(new Event("onmessage", parsed));
            if (parsed.type === "response" && parsed.id && callbacks[parsed.id]) callbacks[parsed.id](parsed);
            if (parsed.type === "subscription" && parsed.id && subscriptions[parsed.id]) subscriptions[parsed.id](parsed.result);
        } catch (e) {
            console.error("Returned non-JSON reply!")
            console.log(ev.data);
        }
    }
    

    return {
        backendConnection: connection,
        backendMessages: messages,
        eventTarget: eventTarget,
        buildGraph: buildGraph,
        getStatus: () => new Promise((resolve, reject) => {
            const id = getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(response);
                else reject(response);
            };
            sendEvent(connection, 'get_status', {}, id)
        }),
        createSchema: (schema) => new Promise((resolve, reject) => {
            const id = getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(response);
                else reject(response);
            };
            sendEvent(connection, "create_unigraph_schema", {schema: schema}, id)
        }),
        ensureSchema: (name, fallback) => new Promise((resolve, reject) => {
            const id = getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(response);
                else reject(response);
            };
            sendEvent(connection, "ensure_unigraph_schema", {name: name, fallback: fallback}, id)
        }),
        ensurePackage: (packageName, fallback) => new Promise((resolve, reject) => {
            const id = getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(response);
                else reject(response);
            };
            sendEvent(connection, "ensure_unigraph_package", {packageName: packageName, fallback: fallback}, id)
        }),
        subscribeToType: (name, callback, eventId = undefined) => new Promise((resolve, reject) => {
            const id = typeof eventId === "number" ? eventId : getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(id);
                else reject(response);
            };
            subscriptions[id] = (result: any) => callback(buildGraph(result));
            sendEvent(connection, "subscribe_to_type", {schema: name}, id);
        }),
        subscribeToObject: (uid, callback, eventId = undefined) => new Promise((resolve, reject) => {
            const id = typeof eventId === "number" ? eventId : getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(id);
                else reject(response);
            };
            subscriptions[id] = (result: any) => callback(result[0]);
            const frag = `(func: uid(${uid})) @recurse { uid expand(_predicate_) }`
            sendEvent(connection, "subscribe_to_object", {queryFragment: frag}, id);
        }), 
        subscribeToQuery: (fragment, callback, eventId = undefined) => new Promise((resolve, reject) => {
            const id = typeof eventId === "number" ? eventId : getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(id);
                else reject(response);
            };
            subscriptions[id] = (result: any) => callback(result);
            sendEvent(connection, "subscribe_to_query", {queryFragment: fragment}, id);
        }), 
        unsubscribe: (id) => {
            sendEvent(connection, "unsubscribe_by_id", {}, id);
        },
        addObject: (object, schema) => {
            sendEvent(connection, "create_unigraph_object", {object: object, schema: schema});
        },
        deleteObject: (uid) => {
            sendEvent(connection, "delete_unigraph_object", {uid: uid});
        },
        updateSimpleObject: (object, predicate, value) => { // TODO: This is very useless, should be removed once we get something better
            const predicateUid = object['_value'][predicate].uid;
            sendEvent(connection, "update_spo", {uid: predicateUid, predicate: typeMap[typeof value], value: value})
        },
        updateObject: (uid, newObject) => {
            sendEvent(connection, "update_object", {uid: uid, newObject: newObject});
        },
        getReferenceables: (key = "unigraph.id", asMapWithContent = false) => new Promise((resolve, reject) => {
            const id = getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success) resolve(response.result.map((obj: { [x: string]: any; }) => obj["unigraph.id"]));
                else reject(response);
            };
            sendEvent(connection, "query_by_string_with_vars", {
                vars: {},
                query: `{
                    q(func: has(unigraph.id)) {
                        unigraph.id
                    }
                }`
            }, id);
        }),
        getSchemas: (schemas: string[] | undefined, resolve = false) => new Promise((resolver, reject) => {
            const id = getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success && response.schemas) resolver(response.schemas);
                else reject(response);
            };
            sendEvent(connection, "get_schemas", {
                schemas: [],
                resolve: resolve
            }, id);
        }),
        getPackages: (packages) => new Promise((resolve, reject) => {
            const id = getRandomInt();
            callbacks[id] = (response: any) => {
                if (response.success && response.packages) resolve(response.packages);
                else reject(response);
            };
            sendEvent(connection, "get_packages", {
                packages: []
            }, id);
        }),
        /**
         * Proxifies a fetch request through the server process. This is to ensure a similar experience 
         * as using a browser (and NOT using an webapp).
         * 
         * Accepts exactly parameters of fetch. Returns a promise containing the blob content
         * (you can use blobToJson to convert to JSON if that's what's returned)
         * 
         * @param url 
         * @param options 
         */
        proxyFetch: (url, options?) => new Promise((resolve, reject) => {
            const id = getRandomInt();
            callbacks[id] = (responseBlob: {success: boolean, blob: string}) => {
                if (responseBlob.success && responseBlob.blob)
                    resolve(base64ToBlob(responseBlob.blob))
                else reject(responseBlob);
            };
            sendEvent(connection, "proxy_fetch", {
                url: url,
                options: options
            }, id);
        }),
        importObjects: (objects) => new Promise((resolve, reject) => {
            if (typeof objects !== "string") objects = JSON.stringify(objects)
            const id = getRandomInt();
            sendEvent(connection, "import_objects", {objects: objects}, id);
        }),
        runExecutable: (unigraphid, params?) => new Promise((resolve, reject) => {
            const id = getRandomInt();
            sendEvent(connection, "run_executable", {"unigraph.id": unigraphid, params: params ? params : {}}, id);
        }),
        getType: (name) => {throw Error("Not implemented")},
        getQueries: (name) => {throw Error("Not implemented")}
    }
}

export function getExecutableId(pkg: PackageDeclaration, name: string) { 
    return `$/package/${pkg.pkgManifest.package_name}/${pkg.pkgManifest.version}/executable/${name}` 
}