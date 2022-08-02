const mysql = require('../module/mysql_connector')

module.exports = {
    list: async function (data) {
        try {
            await mysql.connectAsync()
            var sql = "SELECT * " +
                "FROM ms_panel_user " +
                "WHERE " +
                "is_delete = 0 " +
                "ORDER BY " + data.order + " " + data.direction + " " +
                "LIMIT " + data.start + ", " + data.length
            var [result, cache] = await mysql.queryAsync(sql)
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    count: async function (data) {
        try {
            await mysql.connectAsync()
            var sql = "SELECT COUNT(*) as 'count' " +
                "FROM ms_panel_user a " +
                "WHERE " +
                "(username LIKE '%" + data.search + "%' OR " +
                "name LIKE '%" + data.search + "%' OR " +
                "role LIKE '%" + data.search + "%') AND " +
                "is_delete = 0 "
            var [result, cache] = await mysql.queryAsync(sql)
            await mysql.endPool()
            return [result[0].count, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    getAll: async function () {
        try {
            await mysql.connectAsync()
            var sql = "SELECT * FROM ms_panel_user";
            var [result, cache] = await mysql.queryAsync(sql)
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    getByNik: async function (nik) {
        try {
            await mysql.connectAsync()
            var sql = "SELECT * FROM ms_panel_user WHERE username = ?";
            var [result, cache] = await mysql.executeAsync(sql, [nik])
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    get: async function (id) {
        try {
            await mysql.connectAsync()
            var sql = "SELECT * FROM ms_panel_user WHERE id = ?";
            var [result, cache] = await mysql.executeAsync(sql, [id])
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    delete: async function (data) {
        try {
            await mysql.connectAsync()
            var sql = "UPDATE ms_panel_user SET is_delete = 1, updated_by=? WHERE id = ?";
            var [result, cache] = await mysql.executeAsync(sql, [data.updated_by, data.id])
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    unDelete: async function (data) {
        try {
            await mysql.connectAsync()
            var sql = "UPDATE ms_panel_user SET is_delete = 0, updated=NOW(), role=?, updated_by=? WHERE id = ?";
            var [result, cache] = await mysql.executeAsync(sql, [data.role, data.updated_by, data.id])
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    insert: async function (data) {
        try {
            await mysql.connectAsync()
            var sql = "INSERT INTO ms_panel_user (username,name,role,is_delete, created,created_by,updated,updated_by) VALUES (?, ?, ?, ?, NOW(), ?, NOW(), ?)";
            var [result, cache] = await mysql.executeAsync(sql, [data.username, data.name, data.role, data.is_delete, data.created_by, data.updated_by])
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    },
    update: async function (data) {
        try {
            await mysql.connectAsync()
            var sql = "UPDATE ms_panel_user SET role=?, updated_by=? WHERE id = ?";
            var [result, cache] = await mysql.executeAsync(sql, [data.role, data.updated_by, data.id])
            await mysql.endPool()
            return [result, null]
        } catch (error) {
            console.log(error)
            await mysql.endPool()
            return [null, error]
        }
    }
}