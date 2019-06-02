const Telegraf = require('telegraf')
const mongo = require('mongodb').MongoClient
const axios = require('axios')
const unirest = require('unirest')
const data = require('./data')
const session = require('telegraf/session')
const Stage = require('telegraf/stage')
const Scene = require('telegraf/scenes/base')
const { leave } = Stage
const stage = new Stage()
const bot = new Telegraf(data.token)

const scan = new Scene('scan')
stage.register(scan)
const generate = new Scene('generate')
stage.register(generate)


mongo.connect(data.mongoLink, {useNewUrlParser: true}, (err, client) => {
  if (err) {
    sendError(err)
  }

  db = client.db('oneqrbot')
  bot.startPolling()
})


bot.use(session())
bot.use(stage.middleware())

bot.start((ctx) => {
  starter(ctx)
})


bot.hears('🔍 Scan QR Code', (ctx) => {
  ctx.scene.enter('scan')
})

bot.hears('🖊 Generate QR Code', (ctx) => {
  ctx.scene.enter('generate')
})

scan.enter((ctx) => {
  ctx.reply(
    'I`m ready. Send a picture!', 
    { reply_markup: { keyboard: [['⬅️ Back']], resize_keyboard: true } }
  )
})



scan.on('photo', async (ctx) => {
  ctx.replyWithChatAction('typing')

  const imageData = await bot.telegram.getFile(ctx.message.photo[ctx.message.photo.length - 1].file_id)

  axios({
    url: `https://api.qrserver.com/v1/read-qr-code/?fileurl=https://api.telegram.org/file/bot${data.token}/${imageData.file_path}`,
    method: 'GET'
  })
    .then(async (response) => {
      if (response.data[0].symbol[0].error === null) {
        await ctx.reply('Scanned data:')
        await ctx.reply(response.data[0].symbol[0].data)
      } else {
        await ctx.reply('No data found on this picture.')
      }
    
      ctx.reply('You can send me other pictures or tap "⬅️ Back"')

      updateStat('scanning')
      updateUser(ctx, true)
    })
    .catch((err) => {
      ctx.reply('No data found on this picture.')
      sendError(err, ctx)
    })
})

scan.hears('⬅️ Back', (ctx) => {
  starter(ctx)
  ctx.scene.leave('scan')
})


generate.enter((ctx) => {
  ctx.reply(
    'I`m ready. Send me text!', 
    { reply_markup: { keyboard: [['⬅️ Back']], resize_keyboard: true } }
  )
})

generate.hears('⬅️ Back', (ctx) => {
  starter(ctx)
  ctx.scene.leave('generate')
})

generate.on('text', async (ctx) => {
  if (ctx.message.text.length > 900) {
    return ctx.reply('Your text is too long. Please send text that contains not more than 900 symbols.')
  }

  ctx.replyWithChatAction('upload_photo')

  axios.get(`http://api.qrserver.com/v1/create-qr-code/?data=${encodeURI(ctx.message.text)}&size=300x300`)
    .then(async (response) => {
      await ctx.replyWithPhoto(`http://api.qrserver.com/v1/create-qr-code/?data=${encodeURI(ctx.message.text)}&size=300x300`, { caption: 'Generated via @OneQRBot' })
      ctx.reply('You can send me another text or tap "⬅️ Back"')
    
      updateStat('generating')
      updateUser(ctx, true)
    })
    .catch(async (err) => {
      console.log(err)
      await ctx.reply('Data you sent isn`t valid. Please check that and try again.')
      ctx.reply('You can send me another text or tap "⬅️ Back"')

      sendError(`Generating error by message ${ctx.message.text}: \n\n ${err.toString()}`, ctx)
    })  
})


bot.hears('📈 Statistic', async (ctx) => {
  const allUsers = (await db.collection('allUsers').find({}).toArray()).length
  const activeUsers = (await db.collection('allUsers').find({status: 'active'}).toArray()).length
  const blockedUsers = (await db.collection('allUsers').find({status: 'blocked'}).toArray()).length
  const scanned = await db.collection('statistic').find({genAct: 'scanning'}).toArray()
  const generated = await db.collection('statistic').find({genAct: 'generating'}).toArray()
  let todayScans = +(await db.collection('statistic').find({action: 'scanning'}).toArray())[0][makeDate()]
  let todayGens = +(await db.collection('statistic').find({action: 'generating'}).toArray())[0][makeDate()]

  !todayScans ? todayScans = 0 : false
  !todayGens ? todayGens = 0 : false

  ctx.reply(
    `👥 <strong>Total users: ${allUsers}</strong>` +
    `\n🤴 Active users: ${activeUsers} - ${Math.round((activeUsers / allUsers) * 100)}%` +
    `\n🧛‍♂️ Blocked users: ${blockedUsers} - ${Math.round((blockedUsers / allUsers) * 100)}%` +

    `\n\n🕹 <strong>All actions: ${scanned[0].count + generated[0].count}</strong>` +
    `\n📽 Scanned: ${scanned[0].count} times - ${Math.round((scanned[0].count / (scanned[0].count + generated[0].count)) * 100)}%` +
    `\n📤 Generated: ${generated[0].count} times - ${Math.round((generated[0].count / (scanned[0].count + generated[0].count)) * 100)}%` +

    `\n\n📅 <strong>Actions today: ${todayScans + todayGens} - ${Math.round((todayScans + todayGens) / (scanned[0].count + generated[0].count)) * 100}% of all</strong>` +
    `\n📽 Scanned today: ${todayScans} times - ${Math.round((todayScans / (todayScans + todayGens)) * 100)}%` +
    `\n📤 Generated today: ${todayGens} times - ${Math.round((todayGens / (todayScans + todayGens)) * 100)}%`,
    {parse_mode: 'html'}
  )
})


bot.command('users', async (ctx) => {
  let allUsers = await db.collection('allUsers').find({}).toArray()
  let activeUsers = 0
  let blockedUsers = 0

  for (let key of allUsers) {
    await bot.telegram.sendChatAction(key.userId, 'typing')
      .then((res) => {
        activeUsers++
      })
      .catch((err) => {
        blockedUsers++
        updateUser(ctx, false)
      })
  }

  ctx.reply(
    `⭕️ Total users: ${allUsers.length} ` +
    `\n✅ Active users: ${activeUsers} - ${Math.round((activeUsers / allUsers.length) * 100)}%` +
    `\n❌ Blocked users: ${blockedUsers} - ${Math.round((blockedUsers / allUsers.length) * 100)}%`
  )
})

bot.on('message', async (ctx) => {
  ctx.scene.leave('scan')
  ctx.scene.leave('generator')
  starter(ctx)
})


function starter (ctx) {
  ctx.reply(
    'Hi! What want you to do?', 
    { reply_markup: { keyboard: [['🔍 Scan QR Code'], ['🖊 Generate QR Code'], ['📈 Statistic']], resize_keyboard: true } }
  )

  updateUser(ctx, true)
}

function updateUser (ctx, active) {
  let jetzt = active ? 'active' : 'blocked'
  db.collection('allUsers').updateOne({userId: ctx.from.id}, {$set: {status: jetzt}}, {upsert: true, new: true})
}

function updateStat (action) {
  db.collection('statistic').updateOne({action: action}, {$inc: {[makeDate()]: 1}}, {new: true, upsert: true})
  db.collection('statistic').updateOne({genAct: action}, {$inc: {count: 1}}, {new: true, upsert: true})
}

function makeDate () {
  const today = new Date()
  const yyyy = today.getFullYear()
  let mm = today.getMonth() + 1
  let dd = today.getDate()

  dd < 10 ? dd = '0' + dd : false
  mm < 10 ? mm = '0' + mm : false
  return `${mm}/${dd}/${yyyy}`
}

function sendError (err, ctx) {
  if (err.toString().includes('message is not modified')) {
    return
  }
  bot.telegram.sendMessage(data.dev, `Ошибка у [${ctx.from.first_name}](tg://user?id=${ctx.from.id}) \n\nОшибка: ${err}`, { parse_mode: 'markdown' })
}