import Stripe from "stripe";

// Singleton lazy — instancia o cliente Stripe só na primeira chamada.
// Não crasha no startup se STRIPE_SECRET_KEY não estiver no .env,
// permitindo que o resto da API funcione normalmente em dev sem chaves Stripe.
let _stripe = null;

export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("[stripe] STRIPE_SECRET_KEY não definida");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("[stripe] Cliente Stripe inicializado");
  }
  return _stripe;
}
