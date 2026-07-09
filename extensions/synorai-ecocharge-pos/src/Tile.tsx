import React from "react";
import {
  Tile,
  reactExtension,
  useApi,
} from "@shopify/ui-extensions-react/point-of-sale";

const EcoFeeTile = () => {
  const api = useApi<"pos.home.tile.render">();

  return (
    <Tile
      title="Eco fees"
      subtitle="Apply provincial EHF to cart"
      enabled
      onPress={() => {
        api.action.presentModal();
      }}
    />
  );
};

export default reactExtension("pos.home.tile.render", () => <EcoFeeTile />);
