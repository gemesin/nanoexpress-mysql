const nanoexpress = require('nanoexpress')
const bodyParser = require('@nanoexpress/middleware-body-parser/cjs')

const mysql = require('mysql')
const connection = mysql.createConnection({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DBNAME
})

connection.connect()

//CREATE DB activities
connection.query(`
  CREATE TABLE IF NOT EXISTS activities (
    id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(250) NOT NULL DEFAULT '' COLLATE 'latin1_swedish_ci',
    title VARCHAR(100) NULL DEFAULT '' COLLATE 'latin1_swedish_ci',
    created_at TIMESTAMP NULL DEFAULT current_timestamp(),
    updated_at TIMESTAMP NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    PRIMARY KEY (id) USING BTREE
  )
  COLLATE='latin1_swedish_ci'
  ENGINE=MyISAM
`, function (error, results, fields) {
  if (error) throw error
})

//CREATE DB todos
connection.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
      title VARCHAR(100) NULL DEFAULT NULL COLLATE 'latin1_swedish_ci',
      activity_group_id INT(10) UNSIGNED NULL DEFAULT '0',
      is_active TINYINT(3) UNSIGNED NULL DEFAULT '1',
      priority ENUM('very-high','high','normal','low','very-low') NULL DEFAULT 'very-high' COLLATE 'latin1_swedish_ci',
      PRIMARY KEY (id) USING BTREE,
      INDEX activity_group_id (activity_group_id) USING BTREE
    )
    COLLATE='latin1_swedish_ci'
    ENGINE=MyISAM
  `, function (error, results, fields) {
  if (error) throw error
})

const app = nanoexpress()

app.use(bodyParser())


app.get('/', (req, res) => {
  return res.status(200)
    .json({
      status: "Success",
      message: "Welcome to API Todo List",
    })
})



//======ACTIVITY GROUP======

//list
app.get('/activity-groups', (req, res) => {
  const { query } = req

  try {
    let limit = 1000
    let offset = 0

    let whereQuery = `WHERE 1 = 1`
    if (query && query.email) {
      whereQuery += ` AND email = ${connection.escape(query.email)}`
    }

    let sql = `
          SELECT id, title, created_at
          FROM activities
          ${whereQuery}
          ORDER BY id DESC
          LIMIT ${limit} OFFSET ${offset}
        `
    connection.query(sql, (error, rowsData, fields) => {
      if (error) throw error

      sql = `
            SELECT COUNT(id) as total_data
            FROM activities
            ${whereQuery}
          `
      connection.query(sql, (error, rowsTotal, fields) => {
        if (error) throw error

        let output = {
          status: "Success",
          total: rowsTotal[0].total_data,
          limit,
          skip: offset,
          data: rowsData
        }

        return res.status(200).json(output)
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

// detail
app.get('/activity-groups/:id', (req, res) => {
  const { params } = req

  try {
    let sql = `
          SELECT id, title, email, created_at,
          IFNULL((
            SELECT CONCAT(
              '[', 
                GROUP_CONCAT(JSON_OBJECT('id', todos.id, 'title', todos.title, 'activity_group_id', activity_group_id, 'is_active', is_active, 'priority', priority)),
              ']'
            )
            FROM todos
            WHERE activity_group_id = activities.id
          ), '[]') as todos
          FROM activities
          WHERE id = ${connection.escape(params.id)}
        `
    connection.query(sql, (error, rowsData, fields) => {
      if (error) throw error

      let output = rowsData.length > 0 ? rowsData[0] : {}

      if (rowsData.length > 0) {
        output.todos = JSON.parse(output.todos)
        return res.status(200).json({
          status: "Success",
          data: output
        })
      } else {
        return res.status(404).json({
          status: "Not Found",
          message: `Activity with ID ${params.id} Not Found`,
        })
      }
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

//create
app.post('/activity-groups', (req, res) => {
  const { body } = req

  const CURRENT_TIMESTAMP = { toSqlString: () => 'CURRENT_TIMESTAMP()' }

  if (!body.title || body.title.length <= 0) {
    return res.status(400).json({
      status: "Bad Request",
      message: "title cannot be null",
    })
  }

  const values = {
    title: body.title,
    email: body.email,
    created_at: CURRENT_TIMESTAMP,
    updated_at: CURRENT_TIMESTAMP
  }

  try {
    const sql = mysql.format('INSERT INTO activities SET ?', values)

    connection.query(sql, function (error, results, fields) {
      if (error) throw error

      let sql = `
            SELECT id, title, email, created_at, updated_at
            FROM activities
            WHERE id = ${connection.escape(results.insertId)}
          `
      connection.query(sql, (error, rowsData, fields) => {
        if (error) throw error

        return res.status(201).json({
          status: "Success",
          data: rowsData[0]
        })
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

//remove
app.del('/activity-groups/:id', (req, res) => {
  const { query, params } = req

  try {
    let msgId = params.id
    let whereQuery = `id = ${connection.escape(params.id)}`

    if (query && query.id.length > 0) {
      msgId = query.id
      whereQuery = `id IN (${query.id})`
    }

    connection.query(`SELECT 1 FROM activities WHERE ${whereQuery}`, (error, rowsData, fields) => {
      if (error) throw error

      if (rowsData.length <= 0) {
        return res.status(404).json({
          status: "Not Found",
          message: `Activity with ID ${msgId} Not Found`,
        })
      }

      connection.query(`DELETE FROM activities WHERE ${whereQuery}`, function (error, results, fields) {
        if (error) throw error;

        return res.status(200).json({
          status: "Success",
          data: {}
        })
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

//update
app.patch('/activity-groups/:id', (req, res) => {
  const { body, params } = req

  if (!body.title || body.title.length <= 0) {
    return res.status(400).json({
      status: "Bad Request",
      message: "title cannot be null",
    })
  }

  const CURRENT_TIMESTAMP = { toSqlString: () => 'CURRENT_TIMESTAMP()' }

  try {
    connection.query(`SELECT 1 FROM activities WHERE id = ${connection.escape(params.id)}`, (error, rowsData, fields) => {
      if (error) throw error

      if (rowsData.length <= 0) {
        return res.status(404).json({
          status: "Not Found",
          message: `Activity with ID ${params.id} Not Found`,
        })
      }

      const sql = mysql.format('UPDATE activities SET title = ?, updated_at = ? WHERE id = ?', [body.title, CURRENT_TIMESTAMP, params.id])

      connection.query(sql, function (error, results, fields) {
        if (error) throw error

        let sql = `
              SELECT id, title, email, created_at, updated_at
              FROM activities
              WHERE id = ${connection.escape(params.id)}
            `
        connection.query(sql, (error, rowsData, fields) => {
          if (error) throw error

          return res.status(200).json({
            status: "Success",
            data: rowsData[0]
          })
        })
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})



//======TODO ITEMS======

//create
app.post('/todo-items', (req, res) => {
  const { body } = req

  if (!body.title || body.title.length <= 0) {
    return res.status(400).json({
      status: "Bad Request",
      message: "title cannot be null",
    })
  }

  if (!body.activity_group_id || body.activity_group_id.length <= 0) {
    return res.status(400).json({
      status: "Bad Request",
      message: 'activity_group_id cannot be null',
    })
  }

  const values = {
    activity_group_id: body.activity_group_id,
    title: body.title,
    is_active: body.is_active ? body.is_active : 1,
  }

  try {
    const sql = mysql.format('INSERT INTO todos SET ?', values)

    connection.query(sql, function (error, results, fields) {
      if (error) throw error

      let sql = `
            SELECT id, title, activity_group_id, is_active, priority
            FROM todos
            WHERE id = ${connection.escape(results.insertId)}
          `
      connection.query(sql, (error, rowsData, fields) => {
        if (error) throw error

        let output = rowsData[0]

        output.is_active = output.is_active == 1 ? true : false

        return res.status(201).json({
          status: "Success",
          data: output
        })
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

//list
app.get('/todo-items', (req, res) => {
  const { query } = req

  try {
    let limit = 1000
    let offset = 0

    let whereQuery = `WHERE 1 = 1`
    if (query && query.activity_group_id) {
      whereQuery += ` AND activity_group_id = ${connection.escape(query.activity_group_id)}`
    }

    let sql = `
          SELECT id, title, activity_group_id, is_active, priority
          FROM todos
          ${whereQuery}
          ORDER BY id DESC
          LIMIT ${limit} OFFSET ${offset}
        `
    connection.query(sql, (error, rowsData, fields) => {
      if (error) throw error

      sql = `
            SELECT COUNT(id) as total_data
            FROM todos
            ${whereQuery}
          `
      connection.query(sql, (error, rowsTotal, fields) => {
        if (error) throw error

        let output = {
          status: "Success",
          total: rowsTotal[0].total_data,
          limit,
          skip: offset,
          data: rowsData
        }

        return res.status(200).json(output)
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

//detail
app.get('/todo-items/:id', (req, res) => {
  const { params } = req

  try {
    let sql = `
          SELECT id, title, activity_group_id, is_active, priority
          FROM todos
          WHERE id = ${connection.escape(params.id)}
        `
    connection.query(sql, (error, rowsData, fields) => {
      if (error) throw error

      if (rowsData.length > 0) {
        return res.status(200).json({
          status: "Success",
          data: rowsData[0]
        })
      } else {
        return res.status(404).json({
          status: "Not Found",
          message: `Todo with ID ${params.id} Not Found`,
        })
      }
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

//remove
app.del('/todo-items/:id', (req, res) => {
  const { query, params } = req

  try {
    let msgId = params.id
    let whereQuery = `id = ${connection.escape(params.id)}`

    if (query && query.id.length > 0) {
      msgId = query.id
      whereQuery = `id IN (${query.id})`
    }

    connection.query(`SELECT 1 FROM todos WHERE ${whereQuery}`, (error, rowsData, fields) => {
      if (error) throw error

      if (rowsData.length <= 0) {
        return res.status(404).json({
          status: "Not Found",
          message: `Todo with ID ${msgId} Not Found`,
        })
      }

      connection.query(`DELETE FROM todos WHERE ${whereQuery}`, function (error, results, fields) {
        if (error) throw error;

        return res.status(200).json({
          status: "Success",
          data: {}
        })
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})

//update
app.patch('/todo-items/:id', (req, res) => {
  const { body, params } = req

  try {
    connection.query(`SELECT 1 FROM todos WHERE id = ${connection.escape(params.id)}`, (error, rowsData, fields) => {
      if (error) throw error

      if (rowsData.length <= 0) {
        return res.status(404).json({
          status: "Not Found",
          message: `Todo with ID ${params.id} Not Found`,
        })
      }

      const sql = mysql.format(`UPDATE todos SET ${Object.keys(body).map(key => `${key} = ?`).join(", ")} WHERE id = ?`, [...Object.values(body), params.id])

      connection.query(sql, function (error, results, fields) {
        if (error) throw error

        let sql = `
              SELECT id, title, activity_group_id, is_active, priority
              FROM todos
              WHERE id = ${connection.escape(params.id)}
            `
        connection.query(sql, (error, rowsData, fields) => {
          if (error) throw error

          return res.status(200).json({
            status: "Success",
            data: rowsData[0]
          })
        })
      })
    })
  } catch (error) {
    return res.status(500).json({
      status: "Internal Server Error",
      message: error.message,
    })
  }
})


app.setNotFoundHandler((req, res) => {
  return res.status(404)
    .json({
      status: "Not Found",
      message: "Page not found"
    })
})

app.listen(3030, '0.0.0.0')
