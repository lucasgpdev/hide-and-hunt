import { buildLobby } from './lobby.js';
import { buildSenaiClassroom } from './senaiClassroom.js';
import { buildSupermarket } from './supermarket.js';
import { buildSchool } from './school.js';
import { buildOffice } from './office.js';
import { buildMansion } from './mansion.js';
import { buildShoppingMall } from './shoppingMall.js';
import { buildHospital } from './hospital.js';
import { buildRestaurant } from './restaurant.js';
import { buildWarehouse } from './warehouse.js';
import { buildHotel } from './hotel.js';
import { buildCity } from './city.js';
import { buildClassicClassroom } from './classicClassroom.js';
import type { MapCatalogEntry, MapDefinition } from './types.js';

export * from './types.js';

/** Os 11 mapas planejados (item 8). `available` indica os já jogáveis. */
export const MAP_CATALOG: readonly MapCatalogEntry[] = [
  { id: 'supermarket', name: 'Supermercado', available: true, description: 'Corredores, freezers, caixas e estoque.' },
  { id: 'school', name: 'Escola', available: true, description: 'Salas, biblioteca, refeitório e pátio.' },
  { id: 'office', name: 'Escritório', available: true, description: 'Estações de trabalho e salas de reunião.' },
  { id: 'mansion', name: 'Mansão', available: true, description: 'Quartos, biblioteca e garagem.' },
  {
    id: 'senai_classroom',
    name: 'SENAI Classroom',
    available: true,
    description: 'Sala técnica, laboratório, almoxarifado e corredor.',
  },
  { id: 'shopping_mall', name: 'Shopping', available: true, description: 'Lojas, praça de alimentação e quiosques.' },
  { id: 'hospital', name: 'Hospital', available: true, description: 'Recepção, quartos e farmácia.' },
  { id: 'restaurant', name: 'Restaurante', available: true, description: 'Cozinha, salão e estoque.' },
  { id: 'warehouse', name: 'Armazém', available: true, description: 'Prateleiras, paletes e empilhadeiras.' },
  { id: 'hotel', name: 'Hotel', available: true, description: 'Recepção, quartos e elevadores.' },
  { id: 'city', name: 'Cidade', available: true, description: 'Ruas, lojas, casas e praças.' },
  {
    id: 'classic_classroom',
    name: 'Sala de Aula Clássica',
    available: true,
    description: 'Sala de aula realista com carteiras antigas e corredor.',
  },
];

const builders: Record<string, () => MapDefinition> = {
  lobby: buildLobby,
  supermarket: buildSupermarket,
  senai_classroom: buildSenaiClassroom,
  school: buildSchool,
  office: buildOffice,
  mansion: buildMansion,
  shopping_mall: buildShoppingMall,
  hospital: buildHospital,
  restaurant: buildRestaurant,
  warehouse: buildWarehouse,
  hotel: buildHotel,
  city: buildCity,
  classic_classroom: buildClassicClassroom,
};

/** Mapa usado enquanto a sala espera jogadores (lobby 3D). */
export const LOBBY_MAP_ID = 'lobby';

const cache = new Map<string, MapDefinition>();

/** Devolve a definição de um mapa jogável (gerada uma única vez). */
export function getMap(id: string): MapDefinition | undefined {
  const cached = cache.get(id);
  if (cached) return cached;
  const build = builders[id];
  if (!build) return undefined;
  const map = build();
  cache.set(id, map);
  return map;
}

export const PLAYABLE_MAP_IDS: readonly string[] = MAP_CATALOG.filter((m) => m.available).map((m) => m.id);

export function isPlayableMap(id: string): boolean {
  return PLAYABLE_MAP_IDS.includes(id);
}
