import '@shopify/ui-extensions/preact';
import { render } from 'preact';

export default async () => {
  render(<EcoFeeTile />, document.body);
};

function EcoFeeTile() {
  return (
    <s-tile
      heading="Eco fees"
      subheading="Apply provincial EHF to cart"
      onClick={() => shopify.action.presentModal()}
    />
  );
}
