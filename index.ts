import App from "./App";
import config from "./config";
import RestaurantAdminController from "./Restaurant/Restaurant.admin.controller";
import RestaurantClientController from "./Restaurant/Restaurant.client.controller";
const app = new App(
  [
    { subdomain: "admin", controller: new RestaurantAdminController() },
    { subdomain: "client", controller: new RestaurantClientController() },
  ],
  config.PORT
);
app.listen();
