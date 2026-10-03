import fs from 'node:fs';
const s=fs.readFileSync('src/native/androidSourceFiles.ts','utf8');
const forbidden=['voice rendering pipeline','SPSC Lock-free queue trigger','Apply biquad coefficients','Stereo feedback delay loop','TODO: implement','not implemented'];
const found=forbidden.filter(x=>s.includes(x));
if(found.length){console.error('Incomplete native source markers:',found.join(', '));process.exit(1)}
for(const required of ['AudioEngine.cpp','DspEffects.h','AudioEngineJni.cpp','AudioEngineBridge.kt','CMakeLists.txt'])if(!s.includes(required)){console.error('Missing native source:',required);process.exit(1)}
console.log('Native source bundle completeness check passed.');
