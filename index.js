// =====================================================
//  WR RACING BOT — devis, dossiers clients, tickets, Shopify
// =====================================================
const {
  Client, GatewayIntentBits, Events, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} = require('discord.js');
const express = require('express');
const crypto = require('crypto');
const config = require('./config');

const { DISCORD_TOKEN, GUILD_ID, SHOPIFY_WEBHOOK_SECRET } = process.env;
const PORT = process.env.PORT || 3000;

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('❌ Il manque DISCORD_TOKEN ou GUILD_ID dans les variables Railway.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ---------- Outils ----------
const norm = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const cut = (s, n = 1024) => (!s ? '—' : s.length > n ? s.slice(0, n - 1) + '…' : s);
const bullets = (arr) => arr.map((l) => `• ${l}`).join('\n');
const lines = (txt) => bullets(txt.split('\n').map((l) => l.trim()).filter(Boolean));
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'client';

async function findChannel(guild, part, type) {
  await guild.channels.fetch();
  return guild.channels.cache.find((c) => norm(c.name).includes(norm(part)) && (type === undefined || c.type === type));
}
const findRole = (guild, name) => guild.roles.cache.find((r) => norm(r.name).includes(norm(name)));
const tagIds = (forum, names) =>
  forum.availableTags.filter((t) => names.some((n) => norm(t.name) === norm(n))).map((t) => t.id).slice(0, 5);

function isStaff(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.some((r) => ['patron', 'mecano'].some((n) => norm(r.name).includes(n)));
}

async function log(guild, text) {
  try {
    const ch = await findChannel(guild, 'logs-bot', ChannelType.GuildText);
    if (ch) await ch.send(text.slice(0, 1900));
  } catch (_) { /* rien */ }
}

function numeroDevis(kind) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `WR-${kind}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---------- Commandes ----------
const commands = [
  new SlashCommandBuilder()
    .setName('devis-faisceau')
    .setDescription('Créer un devis faisceau')
    .addStringOption((o) => o.setName('type').setDescription('Type de faisceau').setRequired(true)
      .addChoices({ name: 'Simplifié homologué', value: 'simplifie' }, { name: 'Personnalisé', value: 'perso' }))
    .addUserOption((o) => o.setName('client').setDescription('Le client sur Discord (facultatif)'))
    .addStringOption((o) => o.setName('demande').setDescription('Options ou demande du client (facultatif)')),
  new SlashCommandBuilder()
    .setName('devis-prepa')
    .setDescription('Créer un devis préparation moteur')
    .addStringOption((o) => o.setName('stage').setDescription('Type de préparation').setRequired(true)
      .addChoices(
        { name: 'Stage 1', value: 's1' }, { name: 'Stage 2', value: 's2' },
        { name: 'Stage 3', value: 's3' }, { name: 'Sur mesure', value: 'surmesure' },
      ))
    .addUserOption((o) => o.setName('client').setDescription('Le client sur Discord (facultatif)'))
    .addStringOption((o) => o.setName('demande').setDescription('Demande du client (facultatif)')),
  new SlashCommandBuilder()
    .setName('statut')
    .setDescription('Changer le statut du devis ou du dossier où tu te trouves')
    .addStringOption((o) => o.setName('statut').setDescription('Nouveau statut').setRequired(true)
      .addChoices(...config.statuts.map((s) => ({ name: s, value: s })))),
  new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Installer le bouton « Faire une demande » dans le salon ouvrir-un-ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

// Demandes en attente entre la commande et le formulaire
const pending = new Map();

// ---------- Tickets ----------
async function createTicket(guild, user) {
  await guild.channels.fetch();
  const existing = guild.channels.cache.find((c) => c.topic === `client:${user.id}`);
  if (existing) return existing;

  const parent = await findChannel(guild, 'demandes', ChannelType.GuildCategory);
  const V = PermissionFlagsBits;
  const staffPerms = [V.ViewChannel, V.SendMessages, V.ReadMessageHistory, V.AttachFiles, V.EmbedLinks];
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [V.ViewChannel] },
    { id: user.id, allow: [V.ViewChannel, V.SendMessages, V.ReadMessageHistory, V.AttachFiles] },
    { id: client.user.id, allow: [...staffPerms, V.ManageChannels] },
  ];
  for (const n of ['patron', 'mecano']) {
    const r = findRole(guild, n);
    if (r) overwrites.push({ id: r.id, allow: staffPerms });
  }

  const channel = await guild.channels.create({
    name: `ticket-${slug(user.username)}`,
    type: ChannelType.GuildText,
    parent: parent?.id,
    topic: `client:${user.id}`,
    permissionOverwrites: overwrites,
  });

  const clientRole = findRole(guild, 'client');
  if (clientRole) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) await member.roles.add(clientRole).catch(() => {});
  }
  return channel;
}

// ---------- Création d'un devis ----------
async function handleDevis(i) {
  const data = pending.get(i.customId);
  if (!data) return i.reply({ content: '⏱️ Formulaire expiré, relance la commande.', ephemeral: true });
  pending.delete(i.customId);
  await i.deferReply({ ephemeral: true });

  const guild = i.guild;
  const isF = data.kind === 'F';
  const info = isF ? config.faisceau[data.type] : config.prepa[data.type];
  const nom = i.fields.getTextInputValue('nom').trim();
  const contact = i.fields.getTextInputValue('contact').trim();
  const moto = i.fields.getTextInputValue('moto').trim();
  const pieces = i.fields.getTextInputValue('pieces').trim();
  const prix = i.fields.getTextInputValue('prix').trim();
  const numero = numeroDevis(data.kind);

  // 1) Devis
  const devisEmbed = new EmbedBuilder()
    .setColor(config.couleur)
    .setTitle(`${isF ? '🧾 Devis faisceau' : '⚙️ Devis préparation moteur'} — ${info.label}`)
    .addFields(
      { name: 'N° de devis', value: numero, inline: true },
      { name: 'Client', value: cut(nom), inline: true },
      { name: 'Moto', value: cut(moto), inline: true },
      { name: 'Demande', value: cut(data.demande) },
      { name: 'Pièces à commander', value: cut(lines(pieces)) },
    );
  if (!isF) devisEmbed.addFields({ name: '🚀 Performances attendues', value: cut(bullets(info.performances)) });
  devisEmbed
    .addFields(
      { name: '✅ Avantages', value: cut(bullets(info.avantages)) },
      { name: '💶 Prix et délai', value: cut(prix) },
    )
    .setFooter({ text: 'WR Racing' })
    .setTimestamp();

  const devisForum = await findChannel(guild, isF ? 'devis-faisceau' : 'devis-prepa', ChannelType.GuildForum);
  if (!devisForum) return i.editReply(`❌ Je ne trouve pas le forum ${isF ? 'devis-faisceaux' : 'devis-prépa-moteur'}.`);
  const devisPost = await devisForum.threads.create({
    name: `${nom} – ${moto}`.slice(0, 100),
    message: { embeds: [devisEmbed] },
    appliedTags: tagIds(devisForum, [info.tag, 'En attente']),
  });

  // 2) Dossier client (un seul par client)
  const dossierForum = await findChannel(guild, 'dossiers-clients', ChannelType.GuildForum);
  let dossier = null;
  if (dossierForum) {
    const typeTag = isF ? 'Faisceau' : 'Prépa moteur';
    const dossierEmbed = new EmbedBuilder()
      .setColor(config.couleur)
      .setTitle(`📁 ${isF ? 'Faisceau' : 'Prépa moteur'} — ${info.label}`)
      .addFields(
        { name: '👤 Client', value: cut(nom), inline: true },
        { name: '📞 Contact', value: cut(contact), inline: true },
        { name: '🏍️ Moto', value: cut(moto), inline: true },
        { name: '📝 Demande', value: cut(data.demande) },
        { name: '🧾 Devis lié', value: `${numero} — ${devisPost.url}` },
        { name: '📦 Pièces à commander', value: cut(lines(pieces)) },
      );
    if (!isF) dossierEmbed.addFields({ name: '🚀 Performances attendues', value: cut(bullets(info.performances)) });
    dossierEmbed.addFields(
      { name: '✅ Avantages', value: cut(bullets(info.avantages)) },
      { name: '💶 Prix et délai', value: cut(prix) },
      { name: '📍 Suivi', value: 'Devis en cours' },
    ).setTimestamp();

    // Cherche un dossier existant au même nom
    const active = await dossierForum.threads.fetchActive();
    dossier = active.threads.find((t) => t.parentId === dossierForum.id && norm(t.name) === norm(nom));
    if (!dossier) {
      const archived = await dossierForum.threads.fetchArchived({ limit: 100 });
      dossier = archived.threads.find((t) => norm(t.name) === norm(nom));
      if (dossier) await dossier.setArchived(false);
    }

    if (dossier) {
      await dossier.send({ content: '➕ **Nouveau devis ajouté au dossier**', embeds: [dossierEmbed] });
      const current = dossierForum.availableTags.filter((t) => dossier.appliedTags.includes(t.id)).map((t) => t.name);
      const hasOther = current.some((n) => norm(n) === norm(isF ? 'Prépa moteur' : 'Faisceau'));
      const keep = current.filter((n) => !['faisceau', 'prepa moteur', 'les deux'].includes(norm(n)));
      await dossier.setAppliedTags(tagIds(dossierForum, [hasOther ? 'Les deux' : typeTag, ...keep])).catch(() => {});
    } else {
      dossier = await dossierForum.threads.create({
        name: nom.slice(0, 100),
        message: { embeds: [dossierEmbed] },
        appliedTags: tagIds(dossierForum, [typeTag, 'Devis en cours']),
      });
    }
  }

  // 3) Espace privé du client
  let ticket = null;
  if (i.channel?.topic?.startsWith('client:')) ticket = i.channel;
  else if (data.clientId) {
    const user = await client.users.fetch(data.clientId).catch(() => null);
    if (user) ticket = await createTicket(guild, user);
  }
  if (ticket) {
    const clientMention = ticket.topic?.replace('client:', '');
    await ticket.send({
      content: `${clientMention ? `<@${clientMention}> ` : ''}📄 Voici ton devis WR Racing :`,
      embeds: [devisEmbed],
    });
  }

  await log(guild, `🧾 Devis ${numero} créé par ${i.user.tag} pour ${nom}`);
  await i.editReply(
    `✅ Devis **${numero}** créé !\n• Devis : ${devisPost.url}` +
    (dossier ? `\n• Dossier client : ${dossier.url}` : '\n⚠️ Forum dossiers-clients introuvable') +
    (ticket ? `\n• Envoyé au client : ${ticket.url}` : ''),
  );
}

// ---------- Interactions ----------
client.on(Events.InteractionCreate, async (i) => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === 'setup-tickets') {
        const ch = await findChannel(i.guild, 'ouvrir-un-ticket', ChannelType.GuildText);
        if (!ch) return i.reply({ content: '❌ Salon ouvrir-un-ticket introuvable.', ephemeral: true });
        await ch.send({
          embeds: [new EmbedBuilder().setColor(config.couleur).setTitle('🏁 Une demande pour WR Racing ?')
            .setDescription('Faisceau sur mesure, faisceau simplifié ou préparation moteur : clique sur le bouton ci-dessous, un espace privé s\'ouvre avec l\'équipe.')],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_open').setLabel('Faire une demande').setEmoji('🎫').setStyle(ButtonStyle.Danger))],
        });
        return i.reply({ content: '✅ Bouton installé.', ephemeral: true });
      }

      if (!isStaff(i.member)) return i.reply({ content: '⛔ Réservé à l\'équipe WR Racing.', ephemeral: true });

      if (i.commandName === 'devis-faisceau' || i.commandName === 'devis-prepa') {
        const isF = i.commandName === 'devis-faisceau';
        let clientId = i.options.getUser('client')?.id || null;
        if (!clientId && i.channel?.topic?.startsWith('client:')) clientId = i.channel.topic.replace('client:', '');
        const key = `devis-${i.id}`;
        pending.set(key, {
          kind: isF ? 'F' : 'P',
          type: i.options.getString(isF ? 'type' : 'stage'),
          clientId,
          demande: i.options.getString('demande') || '',
        });
        setTimeout(() => pending.delete(key), 30 * 60 * 1000);

        const input = (id, label, style, required = true, placeholder = '') =>
          new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setPlaceholder(placeholder));
        const modal = new ModalBuilder().setCustomId(key)
          .setTitle(isF ? 'Devis faisceau — WR Racing' : 'Devis prépa moteur — WR Racing')
          .addComponents(
            input('nom', 'Nom et prénom du client', TextInputStyle.Short),
            input('contact', 'Téléphone / e-mail', TextInputStyle.Short, false),
            input('moto', 'Moto (modèle, année, moteur)', TextInputStyle.Short),
            input('pieces', 'Pièces à commander (une par ligne)', TextInputStyle.Paragraph),
            input('prix', 'Prix total et délai', TextInputStyle.Short, true, 'Ex : 450 € — 2 semaines'),
          );
        return i.showModal(modal);
      }

      if (i.commandName === 'statut') {
        const thread = i.channel;
        if (!thread?.isThread() || thread.parent?.type !== ChannelType.GuildForum) {
          return i.reply({ content: '❌ Utilise cette commande dans un devis ou un dossier client.', ephemeral: true });
        }
        const forum = thread.parent;
        const statut = i.options.getString('statut');
        const statutsNorm = config.statuts.map(norm);
        const keep = forum.availableTags.filter((t) => thread.appliedTags.includes(t.id) && !statutsNorm.includes(norm(t.name))).map((t) => t.name);
        const ids = tagIds(forum, [...keep, statut]);
        await thread.setAppliedTags(ids);
        const found = forum.availableTags.some((t) => norm(t.name) === norm(statut));
        return i.reply(found
          ? `📍 Statut mis à jour : **${statut}**`
          : `⚠️ Le tag « ${statut} » n'existe pas dans ce forum, ajoute-le dans les paramètres du forum.`);
      }
    }

    if (i.isButton() && i.customId === 'ticket_open') {
      await i.deferReply({ ephemeral: true });
      const ch = await createTicket(i.guild, i.user);
      await ch.send(
        `👋 Salut <@${i.user.id}>, bienvenue chez **WR Racing** !\n` +
        'Pour préparer ton devis, dis-nous :\n' +
        '• Ta moto (modèle, année)\n• Ce que tu veux : faisceau simplifié, faisceau personnalisé ou préparation moteur\n' +
        '• Tes envies ou ton budget\n• Des photos si tu en as\n\nL\'équipe te répond au plus vite 🏁',
      );
      return i.editReply(`✅ Ton espace privé est ouvert : ${ch}`);
    }

    if (i.isModalSubmit() && i.customId.startsWith('devis-')) return handleDevis(i);
  } catch (err) {
    console.error(err);
    if (i.guild) await log(i.guild, `❌ Erreur : ${err.message}`);
    const msg = { content: '❌ Une erreur est survenue, regarde le salon logs-bot.', ephemeral: true };
    if (i.deferred || i.replied) await i.editReply(msg).catch(() => {});
    else if (i.isRepliable()) await i.reply(msg).catch(() => {});
  }
});

client.once(Events.ClientReady, async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.commands.set(commands);
  console.log(`✅ ${client.user.tag} en ligne sur ${guild.name}`);
  await log(guild, '🟢 WR Racing Bot démarré');
});

// ---------- Shopify ----------
const app = express();
app.get('/', (_req, res) => res.send('WR Racing Bot en ligne 🏁'));

app.post('/shopify/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  if (!SHOPIFY_WEBHOOK_SECRET) return res.sendStatus(503);
  const hmac = req.get('X-Shopify-Hmac-Sha256') || '';
  const digest = crypto.createHmac('sha256', SHOPIFY_WEBHOOK_SECRET).update(req.body).digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);
  res.sendStatus(200);

  try {
    const topic = req.get('X-Shopify-Topic');
    const d = JSON.parse(req.body.toString('utf8'));
    const guild = await client.guilds.fetch(GUILD_ID);

    if (topic === 'orders/create') {
      const ch = await findChannel(guild, 'nouvelles-commandes', ChannelType.GuildText);
      const nomClient = [d.customer?.first_name, d.customer?.last_name].filter(Boolean).join(' ') || d.email || 'Client';
      const articles = (d.line_items || []).map((l) => `${l.quantity} × ${l.title}${l.variant_title ? ` (${l.variant_title})` : ''}`).join('\n');
      await ch?.send({
        embeds: [new EmbedBuilder().setColor(config.couleur).setTitle(`🛒 Nouvelle commande ${d.name || ''}`)
          .addFields(
            { name: 'Client', value: cut(nomClient), inline: true },
            { name: 'Total', value: `${d.total_price} ${d.currency}`, inline: true },
            { name: 'Articles', value: cut(articles) },
          ).setTimestamp()],
      });
    } else if (topic === 'customers/create') {
      const ch = await findChannel(guild, 'nouveaux-clients', ChannelType.GuildText);
      const nomClient = [d.first_name, d.last_name].filter(Boolean).join(' ') || 'Nouveau client';
      await ch?.send({
        embeds: [new EmbedBuilder().setColor(config.couleur).setTitle('👤 Nouveau client')
          .addFields({ name: 'Nom', value: cut(nomClient), inline: true }, { name: 'E-mail', value: cut(d.email), inline: true })
          .setTimestamp()],
      });
    } else if (topic === 'products/update' || topic === 'products/create') {
      const ch = await findChannel(guild, 'stock-produits', ChannelType.GuildText);
      const stock = (d.variants || []).map((v) => `${v.title} : ${v.inventory_quantity ?? '?'} en stock`).join('\n');
      await ch?.send({
        embeds: [new EmbedBuilder().setColor(config.couleur)
          .setTitle(`📊 Produit ${topic === 'products/create' ? 'ajouté' : 'mis à jour'} : ${d.title}`)
          .addFields({ name: 'Stock', value: cut(stock) }).setTimestamp()],
      });
    }
  } catch (err) {
    console.error('Erreur webhook Shopify', err);
  }
});

app.listen(PORT, () => console.log(`🌐 Serveur web sur le port ${PORT}`));
client.login(DISCORD_TOKEN);
