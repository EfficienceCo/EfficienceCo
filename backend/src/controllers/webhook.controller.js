import { getStripe } from '../config/stripe.js';
import supabase from '../config/database.js';

// Atualiza o campo ativa na tabela licencas para o cliente informado.
// Chamada internamente pelos handlers de evento do Stripe.
async function atualizarLicenca(clienteId, ativa) {
  console.log(`[webhook.controller] ${ativa ? 'Ativando' : 'Desativando'} licença do cliente: ${clienteId}`);

  const { error } = await supabase
    .from('licencas')
    .update({ ativa })
    .eq('cliente_id', clienteId);

  if (error) {
    console.error(`[webhook.controller] Erro ao atualizar licença do cliente ${clienteId}:`, error.message);
  } else {
    console.log(`[webhook.controller] Licença do cliente ${clienteId} ${ativa ? 'ativada' : 'desativada'} com sucesso`);
  }
}

export async function processarWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  console.log('[webhook.controller] Webhook recebido — verificando assinatura');

  // constructEvent exige que req.body seja um Buffer (raw).
  // Por isso /webhook é montado antes do express.json() no app.js.
  let evento;
  try {
    evento = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook.controller] Assinatura inválida:', err.message);
    return res.status(400).json({ erro: `Assinatura inválida: ${err.message}` });
  }

  console.log('[webhook.controller] Evento autenticado:', evento.type);

  try {
    switch (evento.type) {
      // Pagamento confirmado — ativa a licença do cliente
      case 'checkout.session.completed': {
        const clienteId = evento.data.object.metadata?.cliente_id;
        if (clienteId) {
          await atualizarLicenca(clienteId, true);
        } else {
          console.log('[webhook.controller] checkout.session.completed sem cliente_id no metadata — ignorado');
        }
        break;
      }

      // Assinatura cancelada — desativa a licença
      case 'customer.subscription.deleted': {
        const clienteId = evento.data.object.metadata?.cliente_id;
        if (clienteId) {
          await atualizarLicenca(clienteId, false);
        } else {
          console.log('[webhook.controller] customer.subscription.deleted sem cliente_id no metadata — ignorado');
        }
        break;
      }

      // Falha no pagamento da fatura — busca a subscription para obter o cliente_id
      // e desativa a licença
      case 'invoice.payment_failed': {
        const invoice = evento.data.object;
        console.log(`[webhook.controller] Falha de pagamento na fatura: ${invoice.id}`);

        if (invoice.subscription) {
          const sub = await getStripe().subscriptions.retrieve(invoice.subscription);
          const clienteId = sub.metadata?.cliente_id;
          if (clienteId) {
            await atualizarLicenca(clienteId, false);
          } else {
            console.log('[webhook.controller] invoice.payment_failed — subscription sem cliente_id no metadata');
          }
        }
        break;
      }

      default:
        console.log('[webhook.controller] Evento ignorado (não tratado):', evento.type);
    }
  } catch (err) {
    console.error('[webhook.controller] Erro ao processar evento:', err.message);
    return res.status(500).json({ erro: 'Erro ao processar evento' });
  }

  return res.status(200).json({ recebido: true });
}
