import { PROTOCOL_VERSION } from '@hh/shared';
import type { HealthState } from '../hooks/useServerHealth';
import type { PhysicsCheck } from '../hooks/usePhysicsCheck';
import type { NetworkState } from '../multiplayer/NetworkClient';
import { StatusRow, type StatusTone } from './StatusRow';

interface Props {
  net: NetworkState;
  health: HealthState;
  physics: PhysicsCheck;
  webgl: boolean;
  fps: number | null;
}

function latencyTone(ms: number): StatusTone {
  if (ms < 80) return 'ok';
  if (ms < 160) return 'warn';
  return 'error';
}

/**
 * Painel que mostra, com dados reais, se cada parte da base está funcionando:
 * conexão em tempo real, latência, servidor HTTP, banco, WebGL, física e FPS.
 */
export function DiagnosticsPanel({ net, health, physics, webgl, fps }: Props) {
  const connection: [string, StatusTone] =
    net.status === 'connected'
      ? ['Conectado', 'ok']
      : net.status === 'connecting'
        ? ['Conectando...', 'warn']
        : ['Desconectado', 'error'];

  const latency: [string, StatusTone] =
    net.latencyMs !== null
      ? [`${Math.round(net.latencyMs)} ms`, latencyTone(net.latencyMs)]
      : [net.player ? 'Medindo...' : 'Após entrar', 'idle'];

  const online: [string, StatusTone] = net.stats ? [String(net.stats.onlinePlayers), 'ok'] : ['—', 'idle'];

  const api: [string, StatusTone] =
    health.kind === 'ok'
      ? [`v${health.data.version}`, health.data.protocolVersion === PROTOCOL_VERSION ? 'ok' : 'error']
      : health.kind === 'loading'
        ? ['Verificando...', 'idle']
        : [health.message, 'error'];

  const database: [string, StatusTone] =
    health.kind !== 'ok'
      ? ['—', 'idle']
      : health.data.database === 'connected'
        ? ['PostgreSQL conectado', 'ok']
        : health.data.database === 'disabled'
          ? ['Desativado', 'warn']
          : ['Indisponível', 'error'];

  const rapier: [string, StatusTone] =
    physics.kind === 'ok'
      ? [`Rapier ${physics.version}`, 'ok']
      : physics.kind === 'loading'
        ? ['Carregando...', 'idle']
        : ['Falhou', 'error'];

  const frameRate: [string, StatusTone] =
    fps === null ? ['—', 'idle'] : [`${fps} FPS`, fps >= 50 ? 'ok' : fps >= 30 ? 'warn' : 'error'];

  return (
    <section className="panel diagnostics" aria-labelledby="diagnostics-title">
      <h2 id="diagnostics-title" className="panel-title">
        Diagnóstico do sistema
      </h2>
      <div className="status-list" role="list">
        <StatusRow label="Tempo real" value={connection[0]} tone={connection[1]} hint="Conexão Socket.IO" />
        <StatusRow label="Latência" value={latency[0]} tone={latency[1]} hint="Ida e volta até o servidor" />
        <StatusRow label="Jogadores online" value={online[0]} tone={online[1]} />
        <StatusRow label="Servidor" value={api[0]} tone={api[1]} hint="Endpoint /api/health" />
        <StatusRow
          label="Banco de dados"
          value={database[0]}
          tone={database[1]}
          hint="Necessário para salvar perfil, ranking e loja entre reinícios do servidor"
        />
        <StatusRow label="WebGL 2" value={webgl ? 'Disponível' : 'Indisponível'} tone={webgl ? 'ok' : 'error'} />
        <StatusRow label="Física" value={rapier[0]} tone={rapier[1]} />
        <StatusRow label="Renderização" value={frameRate[0]} tone={frameRate[1]} />
      </div>
    </section>
  );
}
