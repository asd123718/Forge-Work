import type { FetchOptions, IFetcherService, PaginationOptions, WebSocketConnectOptions } from "./types";
export declare class DefaultFetcherService implements IFetcherService {
    fetch(url: string, options: FetchOptions): Promise<Response>;
    fetchWithPagination<T>(baseUrl: string, options: PaginationOptions<T>): Promise<T[]>;
    createWebSocket(url: string, _options?: WebSocketConnectOptions): {
        webSocket: WebSocket;
    };
}
