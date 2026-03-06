import { handleSignaling } from "../src/handleSignaling.js";

export default {
  async fetch(request: Request) {
    return handleSignaling(request);
  },
};
