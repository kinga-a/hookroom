import { createBlobStore } from '../_lib/blob-store.js';
import { handleApi } from '../_lib/app.js';

export default async function onRequest(context) {
  return handleApi(context.request, createBlobStore());
}
