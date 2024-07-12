import App from "./server/App";
import config from "./server/config";
import RestaurantAdminController from "./server/Restaurant/Restaurant.admin.controller";
import RestaurantClientController from "./server/Restaurant/Restaurant.client.controller";
const app = new App(
  [
    { subdomain: "admin", controller: new RestaurantAdminController() },
    { subdomain: "client", controller: new RestaurantClientController() },
  ],
  config.PORT
);
app.listen();
