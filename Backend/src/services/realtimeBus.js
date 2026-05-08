import { EventEmitter } from "events";

/**
 * realtimeBus — internal pub/sub bridge between services and Socket.IO.
 *
 * Services emit events here. The Socket.IO layer (server.js) listens
 * and broadcasts to clients. This decouples business logic from
 * transport completely.
 */
class RealtimeBusEmitter extends EventEmitter {}

export const realtimeBus = new RealtimeBusEmitter();
export default realtimeBus;
