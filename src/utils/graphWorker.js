// src/utils/graphWorker.js
import { buildIdIndex } from './parser';
import { getFileType } from './helpers';
import { extractImports } from './parser';

self.onmessage = async (e) => {
  const { fileData, pathSet } = e.data;
  
  // Mova toda a lógica interna da sua função buildGraph para cá...
  // Ao final, envie o resultado de volta:
  self.postMessage({ nodes, edges, stats, tree });
};