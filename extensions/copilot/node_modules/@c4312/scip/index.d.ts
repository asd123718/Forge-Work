export * from './scip_pb';
import { Index } from './scip_pb';
export declare const deserializeSCIP: (bytes: Uint8Array) => Index;
export declare const serializeSCIP: (index: Index) => Uint8Array;
