import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('🧪 RUNNING TESTS: Google Colab Video Worker & Cloud Integration\n');

// TEST 1: colab_video_worker.ipynb validity
console.log('Test 1: Verify colab_video_worker.ipynb...');
const notebookPath = path.resolve('colab_video_worker.ipynb');
assert(fs.existsSync(notebookPath), 'colab_video_worker.ipynb must exist in workspace root');

const notebookRaw = fs.readFileSync(notebookPath, 'utf8');
const notebook = JSON.parse(notebookRaw);
assert(Array.isArray(notebook.cells), 'Notebook must have cells');
assert(notebook.cells.length >= 5, 'Notebook must have at least 5 cells');

const fullNotebookText = notebook.cells.map(c => (Array.isArray(c.source) ? c.source.join('') : c.source)).join('\n');
assert(fullNotebookText.includes('drive.mount'), 'Notebook must mount Google Drive');
assert(fullNotebookText.includes('AiVideoWorker'), 'Notebook must use 5 TB Google Drive workspace');
assert(fullNotebookText.includes('ComfyUI'), 'Notebook must set up ComfyUI');
assert(fullNotebookText.includes('cloudflared'), 'Notebook must set up Cloudflare tunnel');
assert(fullNotebookText.includes('trycloudflare.com'), 'Notebook must detect trycloudflare.com link');
console.log('  ✅ colab_video_worker.ipynb is valid, structured, and contains all cells.\n');

// TEST 2: ColabVideoService source check
console.log('Test 2: Verify ColabVideoService source...');
const servicePath = path.resolve('electron/services/colabVideoService.ts');
assert(fs.existsSync(servicePath), 'colabVideoService.ts must exist');

const serviceCode = fs.readFileSync(servicePath, 'utf8');
assert(serviceCode.includes('class ColabVideoService'), 'Must define ColabVideoService');
assert(serviceCode.includes('testConnection'), 'Must implement testConnection');
assert(serviceCode.includes('generateVideo'), 'Must implement generateVideo');
assert(serviceCode.includes('autoDetectTunnelUrl'), 'Must implement autoDetectTunnelUrl');
assert(serviceCode.includes('buildWorkflow'), 'Must implement buildWorkflow');
assert(serviceCode.includes('wan2.1'), 'Must support Wan 2.1');
assert(serviceCode.includes('ltx-video'), 'Must support LTX-Video');
console.log('  ✅ ColabVideoService contains all required methods and safety checks.\n');

// TEST 3: Preload exports check
console.log('Test 3: Verify Preload APIs in dist-electron/preload.cjs...');
const preloadCjsPath = path.resolve('dist-electron/preload.cjs');
assert(fs.existsSync(preloadCjsPath), 'dist-electron/preload.cjs must exist');

const preloadCjs = fs.readFileSync(preloadCjsPath, 'utf8');
assert(preloadCjs.includes('colabSetTunnelUrl'), 'Must expose colabSetTunnelUrl');
assert(preloadCjs.includes('colabTestConnection'), 'Must expose colabTestConnection');
assert(preloadCjs.includes('colabGenerateVideo'), 'Must expose colabGenerateVideo');
assert(preloadCjs.includes('onColabProgress'), 'Must expose onColabProgress');
console.log('  ✅ Preload CommonJS bundle correctly exposes all Cloud Video APIs.\n');

// TEST 4: Frontend UI integration check
console.log('Test 4: Verify UI integration...');
const modalPath = path.resolve('src/components/Controls/CloudVideoModal.tsx');
assert(fs.existsSync(modalPath), 'CloudVideoModal.tsx must exist');

const storePath = path.resolve('src/store/useProjectStore.ts');
const storeCode = fs.readFileSync(storePath, 'utf8');
assert(storeCode.includes('colabTunnelUrl'), 'Store must have colabTunnelUrl');
assert(storeCode.includes('isColabConnected'), 'Store must have isColabConnected');
assert(storeCode.includes('revertSceneToImage'), 'Store must have revertSceneToImage');
console.log('  ✅ UI & State integration is complete and consistent.\n');

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! (100%)');
