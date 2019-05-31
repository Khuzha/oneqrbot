const Telegraf = require('telegraf')
const mongo = require('mongodb').MongoClient
const axios = require('axios')
const unirest = require('unirest')
const session = require('telegraf/session')
const Stage = require('telegraf/stage')
const Scene = require('telegraf/scenes/base')
const { leave } = Stage
const data = require('./data')
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
  const imageData = await bot.telegram.getFile(ctx.message.photo[ctx.message.photo.length - 1].file_id)

  let response = await axios({
    url: `https://api.qrserver.com/v1/read-qr-code/?fileurl=https://api.telegram.org/file/bot${data.token}/${imageData.file_path}`,
    method: 'GET'
  })
  
  if (response.data[0].symbol[0].error === null) {
    await ctx.reply('Scanned data:')
    await ctx.reply(response.data[0].symbol[0].data)
  } else {
    await ctx.reply('No data found on this picture.')
  }

  ctx.reply('You can send me other pictures or tap "⬅️ Back"')
  updateUser(ctx)
})

scan.hears('⬅️ Back', (ctx) => {
  ctx.scene.leave('scan')
})

scan.leave((ctx) => {
  starter(ctx)
})


generate.enter((ctx) => {
  ctx.reply(
    'I`m ready. Send me text!', 
    { reply_markup: { keyboard: [['⬅️ Back']], resize_keyboard: true } }
  )
})

generate.hears('⬅️ Back', (ctx) => {
  ctx.scene.leave('generate')
})

generate.on('text', async (ctx) => {
  ctx.replyWithChatAction('upload_photo')

  let response = await axios.get(`http://api.qrserver.com/v1/create-qr-code/?data=${ctx.message.text}&size=300x300`)

  await ctx.replyWithPhoto(`http://api.qrserver.com/v1/create-qr-code/?data=${ctx.message.text}&size=300x300`, { caption: 'Generated via @OneQRBot' })
  ctx.reply('You can send me another text or tap "⬅️ Back"')

  updateUser(ctx)
})

generate.leave((ctx) => {
  starter(ctx)
})


bot.command('users', async (ctx) => {
  let allUsers = await db.collection('allUsers').find({}).toArray()
  let activeUsers = 0
  let blockedUsers = 0

  for (let key of allUsers) {
    await bot.telegram.sendChatAction(key.userId, 'typing')
      .then((res) => {
        activeUsers++
        console.log(key)
      })
      .catch((err) => {
        blockedUsers++
        db.collection('allUsers').updateOne({userId: key.userId}, {$set: {status: 'blocked'}}, {upsert: true})
      })
  }

  ctx.reply(
    `⭕️ Total users: ${allUsers.length} ` +
    `\n✅ Active users: ${activeUsers} - ${Math.round((activeUsers / allUsers.length) * 100)}%` +
    `\n❌ Blocked users: ${blockedUsers} - ${Math.round((blockedUsers / allUsers.length) * 100)}%`
  )
})

bot.on('message', async (ctx) => {
  starter(ctx)
})


function starter (ctx) {
  ctx.reply(
    'Hi! What want you to do?', 
    { reply_markup: { keyboard: [['🔍 Scan QR Code'], ['🖊 Generate QR Code']], resize_keyboard: true } }
  )

  updateUser(ctx)
}

function updateUser (ctx) {
  db.collection('allUsers').updateOne({userId: ctx.from.id}, {$set: {status: 'active'}}, {upsert: true, new: true})
}