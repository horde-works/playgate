import {
  carveResponseTransfers,
  executeCarveKernel,
  type CarveKernelRequest,
} from "./carveKernel.ts";

/**
 * Воксельная резка вне главного потока. Воркер держит только чистое ядро:
 * ни сцены, ни физики, ни React — вход и выход целиком plain-данные.
 * Валидация цели и применение результата остаются на главном потоке.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CarveKernelRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const response = executeCarveKernel(event.data);
  scope.postMessage(response, carveResponseTransfers(response));
};
