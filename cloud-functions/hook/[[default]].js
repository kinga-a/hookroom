import { createBlobStore } from '../_lib/blob-store.js';
import { handleHook } from '../_lib/app.js';

export default async function onRequest(context) {
  return handleHook(context.request, createBlobStore());
}
