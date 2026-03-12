import path from "path";

export const CITIES = [
  {
    name: "London",
    station: "EGLC",
    lat: 51.505,
    lon: 0.055,
    tz: "Europe/London",
    aliases: ["London"],
  },
  {
    name: "Dallas",
    station: "KDAL",
    lat: 32.847,
    lon: -96.852,
    tz: "America/Chicago",
    aliases: ["Dallas", "DFW"],
  },
  {
    name: "Atlanta",
    station: "KATL",
    lat: 33.6407,
    lon: -84.4277,
    tz: "America/New_York",
    aliases: ["Atlanta", "ATL"],
  },
  {
    name: "NYC",
    station: "KJFK",
    lat: 40.6413,
    lon: -73.7781,
    tz: "America/New_York",
    aliases: ["NYC", "New York City", "New York"],
  },
  {
    name: "Seoul",
    station: "RKSI",
    lat: 37.4602,
    lon: 126.4407,
    tz: "Asia/Seoul",
    aliases: ["Seoul"],
  },
  {
    name: "Chicago",
    station: "KORD",
    lat: 41.9742,
    lon: -87.9073,
    tz: "America/Chicago",
    aliases: ["Chicago"],
  },
  {
    name: "Miami",
    station: "KMIA",
    lat: 25.7959,
    lon: -80.287,
    tz: "America/New_York",
    aliases: ["Miami"],
  },
  {
    name: "Houston",
    station: "KIAH",
    lat: 29.9902,
    lon: -95.3368,
    tz: "America/Chicago",
    aliases: ["Houston"],
  },
  {
    name: "Phoenix",
    station: "KPHX",
    lat: 33.4373,
    lon: -112.0078,
    tz: "America/Phoenix",
    aliases: ["Phoenix"],
  },
  {
    name: "Denver",
    station: "KDEN",
    lat: 39.8561,
    lon: -104.6737,
    tz: "America/Denver",
    aliases: ["Denver"],
  },
  {
    name: "Los Angeles",
    station: "KLAX",
    lat: 33.9425,
    lon: -118.4081,
    tz: "America/Los_Angeles",
    aliases: ["Los Angeles", "LA"],
  },
  {
    name: "San Francisco",
    station: "KSFO",
    lat: 37.6213,
    lon: -122.379,
    tz: "America/Los_Angeles",
    aliases: ["San Francisco", "SF"],
  },
];

// Short-range models: highest resolution, best for 0-48hr forecasts
// Global models: lower resolution but work for 3+ day forecasts
// The blending function uses both — short-range models that return data
// for the target date are included alongside global models.
export const MODEL_CANDIDATES = {
  London: {
    shortRange: ["icon_eu"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  Dallas: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  Atlanta: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  NYC: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  Seoul: {
    shortRange: ["jma_msm"],
    global: ["jma_gsm", "ecmwf_ifs025", "icon_global", "cma_grapes_global", "gem_global"],
  },
  Chicago: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  Miami: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  Houston: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  Phoenix: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  Denver: {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  "Los Angeles": {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
  "San Francisco": {
    shortRange: ["ncep_hrrr_conus", "ncep_nam_conus"],
    global: ["ecmwf_ifs025", "gfs_seamless", "icon_global", "gem_global"],
  },
};

export const BASE_BANKROLL = 100;
export const MIN_EDGE = 0.15;
export const MIN_PRICE = 0.15;
export const MAX_PRICE = 0.85;
export const MIN_ABS_MODEL_DIFF = 0.08;
export const MIN_HOURS_TO_CLOSE = 3;
export const MAX_DAILY_EXPOSURE_PCT = 0.15;
export const MAX_CITY_EXPOSURE_PCT = 0.06;
export const STOP_DAILY_DD_PCT = 0.05;

export const SEARCH_TERMS = ["temperature", "rain", "precipitation", "snow", "wind"];

export const DB_PATH = path.resolve(process.cwd(), "data", "trades.db");
