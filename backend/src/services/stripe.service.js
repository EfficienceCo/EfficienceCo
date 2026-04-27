import { getStripe } from '../config/stripe.js';

export async function criarSessaoPagamento({ clienteId, email }) {
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    metadata: { cliente_id: clienteId },
    subscription_data: { metadata: { cliente_id: clienteId } },
    success_url: `${process.env.FRONTEND_URL}/admin/clientes/${clienteId}?pagamento=sucesso`,
    cancel_url: `${process.env.FRONTEND_URL}/admin/clientes/${clienteId}?pagamento=cancelado`,
  });

  return session;
}
