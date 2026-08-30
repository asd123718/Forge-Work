export * from './scip_pb';
import { fromBinary, toBinary } from "@bufbuild/protobuf";
import { Index, IndexSchema } from './scip_pb';

export const deserializeSCIP = (bytes: Uint8Array) => fromBinary(IndexSchema, bytes);
export const serializeSCIP = (index: Index) => toBinary(IndexSchema, index);
