import { getStripe } from '../config/stripe.js';
import supabase from '../config/database.js';

async function atualizarLicenca(clienteId, ativa) {
  const { error } = await supabase
    .from('licencas')
    .update({ ativa })
    .eq('cliente_id', clienteId);

  if (error) {
    console.error(`[webhook.controller] Erro ao ${ativa ? 'ativar' : 'desativar'} licença do cliente ${clienteId}:`, error.message);
  } else {
    console.log(`[webhook.controller] Licença do cliente ${clienteId} ${ativa ? 'ativada' : 'desativada'}`);
  }
}

export async function processarWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  let evento;
  try {
    evento = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook.controller] Assinatura inválida:', err.message);
    return res.status(400).json({ erro: `Assinatura inválida: ${err.message}` });
  }

  console.log('[webhook.controller] Evento recebido:', evento.type);

  try {
    switch (evento.type) {
      case 'checkout.session.completed': {
        const clienteId = evento.data.object.metadata?.cliente_id;
        if (clienteId) await atualizarLicenca(clienteId, true);
        break;
      }

      case 'customer.subscription.deleted': {
        const clienteId = evento.data.object.metadata?.cliente_id;
        if (clienteId) await atualizarLicenca(clienteId, false);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = evento.data.object;
        if (invoice.subscription) {
          const sub = await getStripe().subscriptions.retrieve(invoice.subscription);
          const clienteId = sub.metadata?.cliente_id;
          if (clienteId) await atualizarLicenca(clienteId, false);
        }
        break;
      }

      default:
        console.log('[webhook.controller] Evento ignorado:', evento.type);
    }
  } catch (err) {
    console.error('[webhook.controller] Erro ao processar evento:', err.message);
    return res.status(500).json({ erro: 'Erro ao processar evento' });
  }

  return res.status(200).json({ recebido: true });
}
