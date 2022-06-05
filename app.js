// Подключаем бота
const TelegramBot = require('node-telegram-bot-api');

// Создаем инстанс, передаем туда токен полученый в самом начале
const bot = new TelegramBot(constants.token, {polling: true});

// Регистрируем быстрые команды
bot.setMyCommands([
  {
    command: '/auth',
    description: 'Авторизация. /auth ${token}'
  },
  {
    command: '/start',
    description: 'Старт вотчеров'
  },
  {
    command: '/list',
    description: 'Получить список вотчеров'
  },
]);
// слушаем ввод команды "/auth ${token}"
bot.onText(/\/auth/, async (msg) => {
    try {
      // Парсим эти данные
      const token = msg.text.split(' ')[1];
      const chatId = msg.chat.id;
  
      // Дальше если все введено корректно добавляем их в файл
      if (token && token.length !== 0) {
        const tokens = JSON.parse(await fs.readFile('./store/tokens.json', 'utf-8'));
        
        const data = {
          ...tokens,
          [chatId]: token
        };
  
        await fs.writeFile('./store/tokens.json', JSON.stringify(data));
  
        await bot.sendMessage(chatId, 'token registered');
      }
    } catch (e) {
      console.log(e);
    }
  });
  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = msg.chat.id;
     // Тут мы получаем список слотов на текущую неделю (рассмотрим этот метод ниже)
      const days = helpers.getCurrentWeek();
  
      // Отправляем шаблонное "красивое" сообщение
      await bot.sendMessage(chatId, 'На какое число посмотреть расписание?', {
        "reply_markup": {
          "inline_keyboard": days
        },
      })
  
      // Удаляем /start чтоб не было мусора
      await bot.deleteMessage(chatId, msg.message_id);
    } catch (e) {
      console.log(e);
    }
  });
  const getCurrentWeek = () => {
    // Размер, в целом, не важен, поэтому подключаем момент и не заморачиваемся
    const currentDate = moment();
  
    // Берем начало текущей недели
    const weekStart = currentDate.clone().startOf('isoWeek');
  
    const days = [];
  
    // Ну и формируем даты +- от начала текущей недели, это по своему предпочтению
    for (let i = -7; i <= 12; i++) {
      const day = moment(weekStart).add(i, 'days');
      days.push([{
        // Это текст в элементе
        text: day.format("DD"),
       
        // Вот этот кусок нужен, чтобы можно было корректно отреагировать на нажатие
        // Так как это поле доступно как строка, заворачиваем JSON в строку (лучше ничего не придумал)
        callback_data: JSON.stringify({
          data: day.format('YYYY-MM-DD'),
          id: constants.WEEK_DAY
        })
      }]);
    }
    return days;
  }
  bot.on('callback_query', async (query) => {
    try {
     // Получаем всё, что нужно для обработки нажатия
      const {message: {chat, message_id} = {}, data} = query
      // Разворачиваем JSON обратно и получаем всю мету
      const callbackResponse = JSON.parse(data);
  
     // Наводим красоту
      await bot.deleteMessage(chat.id, message_id);
  
      // По вхождению коллбека разбиваем тело на команды
      if (callbackResponse.id === constants.WEEK_DAY) {
        const day = callbackResponse.data;
  
        // Формируем и отправляем список слотов на текущий день. Подробнее ниже.
        await sendEventsList(chat.id, message_id, day);
      }
    } catch (e) {
      console.log(e);
    }
  });
  const sendEventsList = async (chatId, messageId, day) => {
    try {
      // Просто метод, который дергает метод по токену и дате
      const eventsList = await api.getEventsTimesList(day);
  
      if (eventsList && eventsList.length === 0) {
        await bot.sendMessage(chatId, 'На эту дату нет тренировок');
      } else {
       // Формируем шаблон тренировок на выбранную дату
        const keyboardList = eventsList.map((listItem) => ([{
          text: `${listItem.time} Мест: ${listItem.free}`,
          callback_data: JSON.stringify({
            day,
            data: listItem.time,
            id: constants.EVENTS_LIST
          })
        }]));
  
        // Отправляем сообщение пользователю
        await bot.sendMessage(chatId, 'За каким временем следить?', {
          "reply_markup": {
            "inline_keyboard": keyboardList
          },
        })
      }
    } catch (e) {
      console.log(e);
    }
  };
  bot.on('callback_query', async (query) => {
    try {
      const {message: {chat, message_id} = {}, data} = query
      const callbackResponse = JSON.parse(data);
  
      await bot.deleteMessage(chat.id, message_id);
  
      const watchers = await fs.readFile('./store/meta.json', 'utf-8');
  
      if (callbackResponse.id === constants.EVENTS_LIST) {
       // Тут, на мой взгляд, происходит самое интересное
       // Мы присваиваем новое событие конкретному пользователю
        const eventsWatchers = merge(
          JSON.parse(watchers),
          {
            [chat.id]: {
              [callbackResponse.day]: {
                [callbackResponse.data]: true
              }
            }
          }
        );
  
        // Обновляем файл меты
        await fs.writeFile('./store/meta.json', JSON.stringify(eventsWatchers));
  
        // Сразу проверяем возможность записи
        // По сути, всё, что мы будем делать дальше, это постоянно дергать этот метод
        checkEvents(eventsWatchers);
      }
    } catch (e) {
      console.log(e);
    }
  });
  const checkEvents = async (eventsWatchers) => {
    // Вотчеры получаются так
    // const watchers = await fs.readFile('./store/meta.json');
    const chats = Object.keys(eventsWatchers);
  
    // Тут мы получаем список дат и слотов для каждой даты, если они есть
    const activeDays = helpers.getActiveDays(eventsWatchers);
  
    // Берем каждую дату
    Object.keys(activeDays).forEach(async (day) => {
      
      // Получаем список запрашиваемых слотов для этой даты
      const times = activeDays[day];
  
      // Проходимся по пользователям
      chats.forEach(async (chat) => {
  
        // Запрашиваем список слотов для текущей даты
        const eventsList = await api.getEventsTimesList(day);
  
        
        if (eventsList) {
          eventsList.forEach(async (event) => {
            // Проверяем, есть ли слоты на текущее время
            if (times.indexOf(event.time) !== -1 && event.free !== 0) {
                try {
                  // Проверяем, есть ли в эту дату подписки на слот
                  if (eventsWatchers[chat][day]) {
                    const chatTimes = Object.keys(eventsWatchers[chat][day]);
  
                    // Проверяем, подписан ли пользователь на этот слот
                    if (chatTimes.indexOf(event.time) !== -1) {
                      const tokens = JSON.parse(await fs.readFile('./store/tokens.json', 'utf-8'));
                      // Берем токен пользователя
                      const token = tokens[chat];
                      // Букаем слот
                      const resp = await api.bookEvent(event.bookId, token)
                      // Удаляем подписку у пользователя
                      helpers.deleteWatcher(event.time, day, chat);
                      // Говорим пользователю, что он записан на тренировку
                      bot.sendMessage(chat, `Вы записаны на ${day} ${event.time}`);
                    }
                  }
                }catch (e) {
                  console.log('Book error', e);
                  bot.sendMessage(chat, `Ошибка записи. Попробуйте обновить токен`);
                }
            }
          });
        }
      })
    })
  }
