// Curated multicultural "Surprise Me" playlist. Stored as iTunes search terms (not fixed IDs)
// so lookups stay resolvable even as the catalog changes. See plan §D.3.
export interface PlaylistEntry {
  search: string;
  genre: string;
}

export const SURPRISE_PLAYLIST: PlaylistEntry[] = [
  { search: 'Marc Anthony Vivir Mi Vida', genre: 'salsa' },
  { search: 'Los Angeles Azules Nunca Es Suficiente', genre: 'cumbia' },
  { search: 'Burna Boy Last Last', genre: 'afrobeats' },
  { search: 'A.R. Rahman Jai Ho', genre: 'bollywood' },
  { search: 'BTS Dynamite', genre: 'k-pop' },
  { search: 'Rosalia Malamente', genre: 'flamenco-pop' },
  { search: 'Sergio Mendes Mas Que Nada', genre: 'samba' },
  { search: 'Bob Marley Could You Be Loved', genre: 'reggae' },
  { search: 'Missy Elliott Get Ur Freak On', genre: 'hip-hop' },
  { search: 'Robin S Show Me Love', genre: 'house' },
  { search: 'Daddy Yankee Gasolina', genre: 'reggaeton' },
  { search: 'Panjabi MC Mundian To Bach Ke', genre: 'bhangra' },
  { search: 'Buena Vista Social Club Chan Chan', genre: 'son cubano' },
  { search: 'Tyla Water', genre: 'amapiano' },
  { search: 'Awilo Longomba Karolina', genre: 'soukous' },
  { search: 'Sean Paul Temperature', genre: 'dancehall' },
  { search: 'Gotan Project Santa Maria', genre: 'tango' },
  { search: 'Goran Bregovic Kalashnikov', genre: 'balkan brass' },
  { search: 'YOASOBI Idol', genre: 'j-pop' },
  { search: 'Amr Diab Nour El Ein', genre: 'arabic pop' },
  { search: 'Yemi Alade Johnny', genre: 'afropop' },
  { search: 'Elvis Crespo Suavemente', genre: 'merengue' },
  { search: 'Bee Gees Stayin Alive', genre: 'disco' },
  { search: 'Avicii Levels', genre: 'EDM' },
];

export function pickRandomSong(): PlaylistEntry {
  return SURPRISE_PLAYLIST[Math.floor(Math.random() * SURPRISE_PLAYLIST.length)];
}
