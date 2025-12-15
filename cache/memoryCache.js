const cache = {};
const TTL = 15 * 1000; 

function get(key) {
  const entry = cache[key];
  if (!entry) return null;

  if (Date.now() - entry.timestamp > TTL) {
    delete cache[key];
    return null;
  }
  return entry.data;
}

function set(key, data) {
  cache[key] = {
    data,
    timestamp: Date.now()
  };
}

module.exports = { get, set };
