const mysql = require('mysql');
const config = require('./config');

const expand = (sphinx) => {
	const queryCall = sphinx.query.bind(sphinx)

	sphinx.query = (sql, args, callback) => new Promise((resolve, reject) => {
		if(typeof args === 'function' || typeof args === 'undefined')
		{
			queryCall(sql, (err, res) => {
				if(err)
					reject(err)
				else
					resolve(res)

				if(args)
					args(err, res)
			})
		}
		else
		{
			queryCall(sql, args, (err, res) => {
				if(err)
					reject(err)
				else
					resolve(res)

				if(callback)
					callback(err, res)
			})
		}
	})

	sphinx.insertValues = (table, values, callback) => new Promise((resolve) => {
		let names = '';
		let data = '';
		for(const val in values)
		{
			if(values[val] === null)
				continue;
            
			names += '`' + val + '`,';
			data += sphinx.escape(values[val]) + ',';
		}
		names = names.slice(0, -1)
		data = data.slice(0, -1)
		let query = `INSERT INTO ${table}(${names}) VALUES(${data})`;
		queryCall(query, (...responce) => {
			if(callback)
				callback(...responce)
			resolve(...responce)
		})
	})

	sphinx.updateValues = (table, values, whereObject, callback) => new Promise((resolve) => {
		let set = ''
		for(const val in values)
		{
			if(values[val] === null)
				continue;
            
			if(typeof values[val] == 'object')
				continue;

			// skip text indexes (manticore bug https://github.com/manticoresoftware/manticoresearch/issues/84)
			if(typeof values[val] == 'string')
				continue;

			set += '`' + val + '` = ' + sphinx.escape(values[val]) + ',';
		}
		if(set.length == 0)
			return
		set = set.slice(0, -1)

		let where = ''
		for(const w in whereObject)
		{
			if(whereObject[w] === null)
				continue;

			where += '`' + w + '` = ' + sphinx.escape(whereObject[w]) + ' and';
		}
		if(where.length == 0)
			return
		where = where.slice(0, -3)

		const query = `UPDATE ${table} SET ${set} WHERE ${where}`;
		queryCall(query, (...responce) => {
			if(callback)
				callback(...responce)
			resolve(...responce)
		})
	})

	return sphinx
}

const pool = () => {
	let sphinx = mysql.createPool({
		connectionLimit: config.sphinx.connectionLimit,
		host     : config.sphinx.host,
		port     : config.sphinx.port
	});
	return expand(sphinx)
}

let mysqlSingle;
const single = (callback) => {
	mysqlSingle = mysql.createConnection({
		host     : config.sphinx.host,
		port     : config.sphinx.port
	});

	let promiseResolve;
	const connectionPromise = new Promise((resolve) => {
		promiseResolve = resolve
	})
	mysqlSingle.waitConnection = () => connectionPromise;
  
	mysqlSingle.connect((mysqlError) => {
		if (mysqlError) {
			console.error('error connecting: ' + mysqlError.stack);
			return;
		}
  
		if(callback)
			callback(mysqlSingle)

		promiseResolve(mysqlSingle)
	});
  
	mysqlSingle.on('error', (err) => {
		console.log('db error', err);
		if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
			mysqlSingle = undefined
			single();                         // lost due to either server restart, or a
		} else {                                      // connnection idle timeout (the wait_timeout
			throw err;                                  // server variable configures this)
		}
	});

	mysqlSingle = expand(mysqlSingle)
	return mysqlSingle
}

module.exports = {pool, single}