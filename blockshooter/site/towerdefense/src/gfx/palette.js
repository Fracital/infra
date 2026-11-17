// Color palette + biome definitions. Owned by the orchestrator (asset layer).
// Module top level is DOM-free.

export const COLORS = {
    emerald: '#17dd62',
    gold: '#fcdc5f',
    diamond: '#4aedd9',
    redstone: '#ff3b30',
    lapis: '#4aa8ff',
    amethyst: '#b784f5',
    text: '#f2efe9',
    textDim: '#b9b2c7',
    hpGreen: '#5ee24a',
    hpRed: '#e33b2e',
    camoShimmer: '#8fd7ff',
    regrow: '#67e857',
    fortified: '#9a9aa8',
    rangeFill: 'rgba(255,255,255,0.10)',
    rangeStroke: 'rgba(255,255,255,0.45)',
    rangeBadFill: 'rgba(255,60,40,0.14)',
    rangeBadStroke: 'rgba(255,80,60,0.6)',
};

/**
 * Biome definitions consumed by terrain baking, ambient particles and music.
 * ground/alt/path/water are Textures tile names.
 * tint: optional rgba() overlay baked over the whole map.
 * ambient: Particles.setAmbient() type or null.
 */
export const BIOMES = {
    plains:      { ground: 'grass', alt: 'grass2', path: 'dirt_path', water: 'water', ambient: null, tint: null, music: 'overworld' },
    forest:      { ground: 'grass', alt: 'moss', path: 'dirt_path', water: 'water', ambient: 'leaves', tint: 'rgba(30,60,20,0.06)', music: 'overworld' },
    birch:       { ground: 'grass', alt: 'grass2', path: 'gravel', water: 'water', ambient: 'leaves', tint: 'rgba(70,80,20,0.05)', music: 'overworld' },
    cherry:      { ground: 'grass', alt: 'grass2', path: 'gravel', water: 'water', ambient: 'petals', tint: 'rgba(255,150,200,0.05)', music: 'overworld' },
    village:     { ground: 'grass', alt: 'farmland', path: 'dirt_path', water: 'water', ambient: null, tint: null, music: 'overworld' },
    autumn:      { ground: 'grass2', alt: 'podzol', path: 'dirt_path', water: 'water', ambient: 'leaves', tint: 'rgba(200,120,20,0.07)', music: 'overworld' },
    beach:       { ground: 'sand', alt: 'sandstone', path: 'gravel', water: 'water', ambient: null, tint: 'rgba(255,240,180,0.05)', music: 'overworld' },
    mushroom:    { ground: 'mycelium', alt: 'grass2', path: 'dirt_path', water: 'water', ambient: 'spores', tint: 'rgba(180,120,200,0.06)', music: 'overworld' },
    river:       { ground: 'grass', alt: 'clay', path: 'gravel', water: 'water', ambient: null, tint: null, music: 'overworld' },
    desert:      { ground: 'sand', alt: 'sandstone', path: 'gravel', water: 'water', ambient: null, tint: 'rgba(255,220,120,0.07)', music: 'overworld' },
    savanna:     { ground: 'grass2', alt: 'dirt', path: 'dirt_path', water: 'water', ambient: null, tint: 'rgba(220,180,60,0.08)', music: 'overworld' },
    taiga:       { ground: 'grass', alt: 'podzol', path: 'dirt_path', water: 'water', ambient: 'snow', tint: 'rgba(180,220,255,0.05)', music: 'overworld' },
    swamp:       { ground: 'grass2', alt: 'mud', path: 'mud', water: 'water_deep', ambient: null, tint: 'rgba(40,70,30,0.12)', music: 'overworld' },
    jungle:      { ground: 'grass', alt: 'moss', path: 'mossy_cobble', water: 'water', ambient: 'leaves', tint: 'rgba(20,90,20,0.08)', music: 'overworld' },
    mesa:        { ground: 'red_sand', alt: 'terracotta', path: 'gravel', water: 'water', ambient: null, tint: 'rgba(230,120,40,0.08)', music: 'overworld' },
    ice:         { ground: 'snow', alt: 'ice', path: 'packed_ice', water: 'ice', ambient: 'snow', tint: 'rgba(190,225,255,0.10)', music: 'overworld' },
    coral:       { ground: 'sand', alt: 'coral_pink', path: 'gravel', water: 'water', ambient: 'bubble', tint: 'rgba(80,200,255,0.06)', music: 'overworld' },
    dark_forest: { ground: 'podzol', alt: 'moss', path: 'dirt_path', water: 'water_deep', ambient: 'leaves', tint: 'rgba(10,15,25,0.22)', music: 'overworld' },
    cave:        { ground: 'stone', alt: 'deepslate', path: 'gravel', water: 'water_deep', ambient: null, tint: 'rgba(10,10,20,0.20)', music: 'overworld' },
    stronghold:  { ground: 'stone_bricks', alt: 'cracked_bricks', path: 'stone', water: 'water_deep', ambient: null, tint: 'rgba(10,10,18,0.18)', music: 'overworld' },
    mineshaft:   { ground: 'stone', alt: 'oak_planks', path: 'gravel', water: 'water_deep', ambient: null, tint: 'rgba(20,14,8,0.20)', music: 'overworld' },
    ocean:       { ground: 'prismarine', alt: 'dark_prismarine', path: 'dark_prismarine', water: 'water_deep', ambient: 'bubble', tint: 'rgba(20,80,140,0.14)', music: 'overworld' },
    deep_dark:   { ground: 'sculk', alt: 'deepslate', path: 'deepslate_tiles', water: 'water_deep', ambient: 'souls', tint: 'rgba(5,15,25,0.25)', music: 'end' },
    nether:      { ground: 'netherrack', alt: 'magma', path: 'soul_soil', water: 'lava', ambient: 'ash', tint: 'rgba(160,30,10,0.12)', music: 'nether' },
    crimson:     { ground: 'crimson_nylium', alt: 'netherrack', path: 'soul_soil', water: 'lava', ambient: 'ash', tint: 'rgba(180,20,40,0.10)', music: 'nether' },
    soul_sand:   { ground: 'soul_sand', alt: 'soul_soil', path: 'basalt', water: 'lava', ambient: 'souls', tint: 'rgba(60,120,140,0.10)', music: 'nether' },
    basalt:      { ground: 'basalt', alt: 'netherrack', path: 'gravel', water: 'lava', ambient: 'embers', tint: 'rgba(80,80,90,0.12)', music: 'nether' },
    end:         { ground: 'end_stone', alt: 'purpur', path: 'obsidian', water: 'water_deep', ambient: 'souls', tint: 'rgba(40,20,60,0.18)', music: 'end' },
};
