import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("doc/:id", "routes/document.tsx"),
  route("api/quota", "routes/api.quota.ts"),
] satisfies RouteConfig;
