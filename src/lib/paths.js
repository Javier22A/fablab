export const BASE_URL = import.meta.env.BASE_URL;

export function publicAsset(path) {
  return `${BASE_URL}${path.replace(/^\//, "")}`;
}
