import { getStripe } from "../config/stripe.js";

// Cria uma Checkout Session no Stripe para o cliente assinar o plano.
// metadata.cliente_id é incluído tanto na session quanto na subscription_data
// para que os eventos de cancelamento (customer.subscription.deleted) também
// consigam identificar qual cliente desativar.
export async function criarSessaoPagamento({ clienteId, email }) {
  console.log(
    `[stripe.service] Criando sessão de pagamento para cliente: ${clienteId} | email: ${email}`,
  );

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    metadata: { cliente_id: clienteId },
    subscription_data: { metadata: { cliente_id: clienteId } },
    success_url: `${process.env.FRONTEND_URL}/admin/clientes/${clienteId}?pagamento=sucesso`,
    cancel_url: `${process.env.FRONTEND_URL}/admin/clientes/${clienteId}?pagamento=cancelado`,
  });

  console.log(`[stripe.service] Sessão criada com sucesso: ${session.id}`);
  return session;
}
