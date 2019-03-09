var Telegraf    = require('telegraf');
var config      = require('config');
var MongoClient = require('mongodb').MongoClient;

var constants   = require('./constants');

var bot = new Telegraf(config.get('botToken'));

bot.start((ctx) => {
    var message = ctx.message;
    var from = message && message.from;
    var chat = message && message.chat;
    if (chat && chat.type == 'private') {
        ctx.reply('Dear ' + from.first_name + ', I suppose you are a NIT Kurukshetra Alumnus.' 
        + 'Which batch are you from(the year you took admission)?(YYYY format)');
        console.log("Message from = ", ctx.message);
        var updateObj = {
            from : from,
            questions : constants.questions,
            batch : '',
            location : '',
            email : '',
            organization: '',
            designation: '',
            last_asked: 1
        }
        dbo.collection(config.get('mongoCollections.users')).updateOne({"from.id" : from.id}, 
        { $set : updateObj }, {upsert: true}, function(error, result) {})
    } else {
        ctx.reply("Please introduce yourself on a private chat with me, click @" + config.get('botName'));
    }
});

bot.help((ctx) => ctx.reply('Hi am @' + config.get('botName') + ". I help introduce alumni of NIT Kurukshetra to each other"));

bot.on('new_chat_members', (ctx) => {
    console.log("New chat members =>", ctx && ctx.message && ctx.message.new_chat_members);
    var newMembers = ctx && ctx.message && ctx.message.new_chat_members;
    var membersFirstName = "";
    for (var i in newMembers) {
        if (i > 0) {
            membersFirstName += ", "
        }
        membersFirstName += newMembers[i].first_name;
    }
    var message = "Dear " + membersFirstName
    + ". Welcome to the NITK alumni group! It's a pleasure to have you here."
    + " Please introduce yourself to me, by clicking, @" + config.get('botName')
    + " And I shall further introduce you to everyone."
    ctx.reply(message);
})

bot.on('text', (ctx) => {
    console.log("message =>", ctx.update.message);
    if (ctx && ctx.update && ctx.update.message) {
        var messageRecieved = ctx.update.message;
        var textMsg = messageRecieved.text;
        var from = messageRecieved.from;
        var fromId = from.id;

        //have an array of questions, ask them in order
        //and based NER or regex mark them answered,
        //ask next question from unanswered set
        if (messageRecieved.chat.type == 'private') {
            //reply only if private chat
            dbo.collection(config.get('mongoCollections.users')).findOne({"from.id" : fromId}, function(error, user) {
                var questionId = user.last_asked;

                //when this answer is to last question, redirect to alumni group and ask to introduce
                updateAnswerToQuestionForUser(user, questionId, textMsg, function(error, result) {
                    if (!result.nextQuestion) {
                        ctx.reply("It's pleasure to know you! Please type /introduceMe@" 
                        + config.get('botName') + " in the NIT Kurkshetra Alumni group.");
                    } else {
                        var nextQuestion = result.nextQuestion;
                        ctx.reply(nextQuestion);
                    }
                });
            })
        }
    }
})

bot.launch();

function startInitialProcess() {
    MongoClient.connect(config.get('databaseSettings.database'), function(err, database) {
      db = ''
      if (!err) {
        console.log("Database initialized");
        db = database;
        dbo = db.db(config.get('databaseSettings.name'))
      } else {
        console.error("Error while connecting to mongo");
        throw err;
      }
    })
}
  
startInitialProcess();

function updateAnswerToQuestionForUser(userObj, questionId, textMsg, cb) {
    var questions = userObj.questions;
    var fieldLabel = '';
    var result = {};
    for (var i in questions) {
        if (questions[i].id == questionId) {
            questions[i].is_answered = true;
            fieldLabel = questions[i].answer_key;
            break;
        }
    }
    userObj[fieldLabel] = textMsg;
    for (var i in questions) {
        if ( !questions[i].is_asked ) {
            result.nextQuestion = questions[i].question;
            questions[i].is_asked = true;
            break;
        }
    }

    //tackle for last question
    delete(userObj['last_asked']);
    dbo.collection(config.get('mongoCollections.users')).updateOne({"from.id" : userObj.from.id },
    {$set : userObj, $inc: {last_asked :1}}, function(error, res) {
        console.log("Updating users in mongo::::::: error = ", error, " result = ", res);
        return cb(error, result);
    })
}