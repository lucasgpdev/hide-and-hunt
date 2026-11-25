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
import { buildJpClassroom } from './scenes/jp_classroom.js';
import { buildCountryKitchen } from './scenes/country_kitchen.js';
import { buildWhiteRoom } from './scenes/white_room.js';
import { buildGreyRoom } from './scenes/grey_room.js';
import { buildBreakfastRoom } from './scenes/breakfast_room.js';
import type { MapCatalogEntry, MapDefinition } from './types.js';

export * from './types.js';

/** Os 11 mapas planejados (item 8). `available` indica os já jogáveis. */
/**
 * Mapas da rotação: cenários 3D realistas obtidos no GitHub (cenas de pesquisa
 * de renderização com licença CC0/CC-BY). Os mapas antigos, feitos por código,
 * continuam no projeto, mas fora da rotação (available: false).
 */
export const MAP_CATALOG: readonly MapCatalogEntry[] = [
  { id: 'classic_classroom', name: 'Sala de Aula Clássica', available: true, description: 'Sala antiga realista com carteiras e corredor.' },
  { id: 'jp_classroom', name: 'Sala de Aula Japonesa', available: true, description: 'Carteiras em fileiras, tablado e janelas.' },
  { id: 'country_kitchen', name: 'Cozinha Rústica', available: true, description: 'Fogão, ilha, mesa e cadeiras de madeira.' },
  { id: 'white_room', name: 'Sala Branca', available: true, description: 'Lareira, sofás de couro, poltronas e almofadas.' },
  { id: 'grey_room', name: 'Sala Cinza', available: true, description: 'Sala elegante com sofá, plantas e janelas em arco.' },
  { id: 'breakfast_room', name: 'Sala de Café da Manhã', available: true, description: 'Mesa de mármore e cadeiras de design.' },
  // Mapas antigos (gerados por código), fora da rotação.
  { id: 'supermarket', name: 'Supermercado', available: false, description: 'Corredores, freezers, caixas e estoque.' },
  { id: 'school', name: 'Escola', available: false, description: 'Salas, biblioteca, refeitório e pátio.' },
  { id: 'office', name: 'Escritório', available: false, description: 'Estações de trabalho e salas de reunião.' },
  { id: 'mansion', name: 'Mansão', available: false, description: 'Quartos, biblioteca e garagem.' },
  { id: 'senai_classroom', name: 'SENAI Classroom', available: false, description: 'Sala técnica, laboratório, almoxarifado e corredor.' },
  { id: 'shopping_mall', name: 'Shopping', available: false, description: 'Lojas, praça de alimentação e quiosques.' },
  { id: 'hospital', name: 'Hospital', available: false, description: 'Recepção, quartos e farmácia.' },
  { id: 'restaurant', name: 'Restaurante', available: false, description: 'Cozinha, salão e estoque.' },
  { id: 'warehouse', name: 'Armazém', available: false, description: 'Prateleiras, paletes e empilhadeiras.' },
  { id: 'hotel', name: 'Hotel', available: false, description: 'Recepção, quartos e elevadores.' },
  { id: 'city', name: 'Cidade', available: false, description: 'Ruas, lojas, casas e praças.' },
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
  jp_classroom: buildJpClassroom,
  country_kitchen: buildCountryKitchen,
  white_room: buildWhiteRoom,
  grey_room: buildGreyRoom,
  breakfast_room: buildBreakfastRoom,
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
