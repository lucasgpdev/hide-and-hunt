import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig, loadEnv } from 'vite';

/**
 * Em desenvolvimento, o Vite encaminha /api e /socket.io para o servidor,
 * então cliente e servidor parecem estar na mesma origem.
 * Em produção, defina VITE_SERVER_URL se o servidor estiver em outro domínio.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const serverTarget = env.DEV_SERVER_PROXY_TARGET || 'http://localhost:3001';

  return {
    plugins: [react()],
    resolve: {
      // "source" faz o @hh/shared ser lido direto do TypeScript, com hot reload.
      conditions: ['source', ...defaultClientConditions],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: serverTarget, changeOrigin: true },
        '/socket.io': { target: serverTarget, ws: true, changeOrigin: true },
      },
    },
    // Módulos carregados sob demanda (jogo 3D, replay) já entram na pré-otimização,
    // para o Vite não recarregar a página na primeira vez que forem importados.
    optimizeDeps: {
      include: [
        'three',
        'three/addons/controls/OrbitControls.js',
        'three/addons/utils/BufferGeometryUtils.js',
        'three/addons/loaders/EXRLoader.js',
        'three/addons/loaders/GLTFLoader.js',
        'three/addons/utils/SkeletonUtils.js',
        'three/addons/geometries/RoundedBoxGeometry.js',
        'three/addons/postprocessing/EffectComposer.js',
        'three/addons/postprocessing/RenderPass.js',
        'three/addons/postprocessing/GTAOPass.js',
        'three/addons/postprocessing/UnrealBloomPass.js',
        'three/addons/postprocessing/OutputPass.js',
        '@dimforge/rapier3d-compat',
        'socket.io-client',
      ],
    },
    preview: {
      port: 4173,
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      // O Rapier (física) embute o WebAssembly no JS (~4,3 MB, ~1,7 MB gzip).
      // Ele é carregado sob demanda, então o aviso de tamanho foi ajustado.
      chunkSizeWarningLimit: 4500,
      rolldownOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('node_modules/@dimforge')) return 'rapier';
            if (id.includes('node_modules/react')) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
