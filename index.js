'use strict'
let toDateFormat = d=>{
  if(!d || isNaN(d)){
    return "''"
  }
  return `'${d.getFullYear()}-${('0'+(d.getMonth()+1)).slice(-2)}-${('0'+d.getDate()).slice(-2)} ${('0'+d.getHours()).slice(-2)}:${('0'+d.getMinutes()).slice(-2)}:${('0'+d.getSeconds()).slice(-2)}.${('00'+d.getMilliseconds()).slice(-3)}'`
}
const IN = 'IN'
const LIKE = 'LIKE'
const QUERY = 'query'
const mssql = require('mssql')
const util = require('util')
const fmt = util.format.bind(util)
const _ = require('lodash')
let message = {
  ARRAY_IS_EMPTY:'insert Array is empty',
  CONNECT_FIRST:'Connection not found. connect first',
  ARRAY_CANT_ACCEPT:"Can't accept array to value",
  WHERE_ARG_INVALID:'where accept 1 or 3 string args or Object or Array',
  VALUES_LIMIT:'InsertAll values limit is 1000 rows',
  INSERT_ALL_DATA_INVALID:'InsertAll values are array<array> or array<object>',
  REQUIRE_WHERE_FOR_UPDATE:'Require Update with where parameters'
}
let UPDATE_TEMP = 'UPDATE %s SET %s %s FROM %s %s'
let INSERT_TEMP = 'INSERT INTO %s(%s) %s %s'
let DELETE_TEMP = 'DELETE FROM %s %s %s'
let NULLSTRING = 'NULL'

let defaultConfig = {
  output:false,
  blankToNull:true,
  tableNoLock:false,
  escape:'@',
  debug:true
}

let toSQLStr = (()=>{
  let reg = /'/g
  return n=> `N'${n.replace(reg,"''")}'`
})()
let likeEscape = (()=>{
  let reg = /([[_])/g
  return (str)=>str.replace(reg, '[$1]')})()
function toLiteral(d, escape){
  if(_.isNull(d) || d === void 0){
    return NULLSTRING
  }
  if(d.constructor === String){
    if(d.startsWith(escape)){
      return d.replace(escape, '')
    }
    return toSQLStr(d)
  }
  if(d.constructor === Boolean){
    return d?1:0
  }
  if(d.constructor === Date){
    return toDateFormat(d)
  }
  if(d.constructor === Number){
    return d
  }
  if(_.isArray(d)){
    throw new Error(message.ARRAY_CANT_ACCEPT)
  }
}
/**
 * 
 * @param {object|object[]} ps 
 * @param {string} escape - escape string for sql
 * @returns 
 */
function whereGenerator(ps, escape){
  if(ps === undefined || ps === null){
    return null
  }
  if(ps.constructor === String){
    return ps
  }
  if(Array.isArray(ps)){
    if(ps.length === 0){
      return null
    }
    return `(${ps.map(whereGenerator).join(') OR (')})`
  }
  return Object.keys(ps).map(k=>{
    let v= ps[k]
    if(v === null){
      return `${k} IS NULL`
    }else if(Array.isArray(v)){
      let [operator, val] = v
      operator = operator.toUpperCase()
      if(operator === IN){
        return `${k} IN(${val.map(v=>toLiteral(v, escape)).join(',')})`
      }else if(operator === LIKE ){
        return `${k} LIKE ${toLiteral(likeEscape(val), escape)}`
      }
    }
    const val = toLiteral(v, escape)
    return `${k} = ${val}`
  }).join(' AND ')
}

const {EventEmitter} = require('events')
class mssqlQ extends EventEmitter{
  constructor(dbInfo, opt){
    super()
    this.dbInfo = dbInfo
    this.config = Object.assign({}, defaultConfig)
    if(opt){
      Object.assign(this.config, opt)
    }
  }
  connect(){
    this.pool = new mssql.ConnectionPool(this.dbInfo)
    return this.pool.connect()
  }
  close(){
    this.pool.close()
  }
  q(tbl, tblAlias=tbl){
    if(!this.pool){
      throw new Error(message.CONNECT_FIRST)
    }
    return new Query(this, tbl, tblAlias)
  }
  plain(q){
    return this.pool.request().query(q).then(rs=> rs.recordset)
  }
  getTrans(){
    let trans =  new mssqlQTrans(this.dbInfo, this.pool)
    trans.on(QUERY, q=>this.emit(QUERY, q))
    return trans
  }
  setConfig(opt){
    Object.assign(this.config, opt)
  }
}
mssqlQ.prototype.query = mssqlQ.prototype.q


class mssqlQTrans extends mssqlQ{
  constructor(dbInfo, pool){
    super(dbInfo)
    this.pool = pool.transaction()
  }
  begin(){
    return this.pool.begin()
  }
  commit(){
    return this.pool.commit()
  }
  rollback(){
    return this.pool.rollback()
  }
}

class Query{
  constructor(parent, tbl, tblAlias=tbl){
    this.$p = parent
    this.$req = parent.pool.request()
    this.$t = tbl
    this.$a = tblAlias
    this.$f =//field
    this.$w =//where
    this.$v = //values
    this.$top =// top
    this.$o = // order by
    this.$g = null // group by
    let conf = this.$p.config
    this.$out = conf.output
    this.$escape = conf.escape
    this.$debug = conf.debug
  }
  fields(...args){
    this.$buildFields(null, args)
    return this
  }
  fieldsOf(tblName, ...args){
    this.$buildFields(tblName, args)
    return this
  }
  $buildFields(tblname, args){
    if(!this.$f){
      this.$f = []
    }
    if(tblname){
      tblname += '.'
    }else{
      tblname = ''
    }
    this.$f.push(...(args.map(f=>`${tblname}${f}`)))
  }
  clearFields(...fields){
    this.$f = []
    this.fields(...fields)
    return this
  }
  values(...values){
    if(!this.$v){
      this.$v = []
    }
    this.$v.push(...values)
    return this
  }
  clearValues(...values){
    this.$v = null
    this.values(...values)
    return this
  }
  join(joinType, tbl, condition, tblAlias=tbl){
    if(!this.$j){
      this.$j = []
    }
    this.$j.push({
      joinType,
      tbl,
      condition,
      tblAlias
    })
    return this
  }
  output(f){
    this.$out = !!f
    return this
  }
  orderBy(...args){
    if(!this.$o){
      this.$o = []
    }
    this.$o.push(...args)
    return this
  }
  clearOrderBy(...args){
    this.$o = []
    return this.orderBy(...args)
  }
  $buildOrderBy(){
    if(!this.$o){
      return ''
    }
    return 'ORDER BY ' + this.$o.join(',')
  }
  groupBy(...args){
    if(!this.$g){
      this.$g = []
    }
    this.$g.push(...args)
    return this
  }
  clearGroupBy(...args){
    this.$g = []
    return this.groupBy(...args)
  }
  $buildGroupBy(){
    if(!this.$g){
      return ''
    }
    return 'GROUP BY ' + this.$g.join(',')
  }
  map(mapObject){
    this.fields(...Object.keys(mapObject))
    this.values(...Object.values(mapObject))
    return this
  }
  where(whereParams){
    if(!this.$w){
      this.$w = []
    }
    let whereString = whereGenerator(whereParams, this.$escape)
    if(whereString){
      this.$w.push(whereString)
    }
    return this
  }
  clearWhere(whereParams){
    this.$w = null
    this.where(whereParams)
    return this
  }

  simpleWhere(key, operator, value){
    if(!this.$w){
      this.$w = []
    }
    this.$w.push(`${key} ${operator} ${toLiteral(value)}`)
    return this
  }
  top(n){
    if(!Number.isInteger(n)){
      throw new Error('top arg require an Integer')
    }
    this.$top = `TOP ${n}`
    return this
  }
  $buildJoin(){
    if(!this.$j){
      return ''
    }
    this.$j.push()
    return this.$j.map(j=> `${j.joinType} JOIN ${j.tbl} ${j.tblAlias} ON ${j.condition}`).join(' ')
  }
  $buildSelect(){
    return fmt(
      'SELECT %s %s FROM %s %s %s %s %s',
      this.$top || '',
      (this.$f || ['*']).join(','),
      this.$t,
      this.$a,
      this.$buildJoin(),
      this.$buildWhere(),
      this.$buildGroupBy(),
      this.$buildOrderBy()
    )
  }
  $buildInsert(){
    return fmt(
      INSERT_TEMP,
      this.$t,
      this.$f.join(','),
      this.$buildOutput('INSERTED'),
      this.$buildValues()
    )
  }
  $buildValues(){
    if(this.$sub){
      let subq = this.$sub.$buildSelect()
      return subq
    }
    let normal = 'VALUES(' + this.$v.map(v=>toLiteral(v, this.$escape)).join(',') + ')'
    return normal
  }
  $buildOutput(...types){
    if(!this.$out){
      return ''
    }
    return 'OUTPUT ' + types.map(t=>`${t}.*`)
  }
  $buildWhere(){
    if(!this.$w || !this.$w.length){
      return ''
    }
    return `WHERE (${this.$w.join(') AND (')})`
  }
  select(clbk){
    return this.$query('$buildSelect', clbk)
  }
  selectOne(clbk){
    return this.select()
      .then(rs=>{
        if(rs.length !== 1){
          throw new Error(`selectOne return record counts is ${rs.length}`)
        }
        let [first] = rs
        if(clbk){
          return clbk(first)
        }
        return first
      })
  }
  insert(clbk){
    return this.$query('$buildInsert', clbk)
  }
  insertOne(clbk){
    this.$out = true
    return this.insert(true)
      .then(rs=>{
        if(rs.length !== 1){
          throw new Error(`insertOne return record counts is ${rs.length}`)
        }
        let [first] = rs
        if(clbk){
          return clbk(first)
        }
        return first
      })
  }
  $buildInsertAll(array){
    if(array.length === 0){
      throw new Error(message.ARRAY_IS_EMPTY)
    }
    const [first] = array
    let values
    if(Array.isArray(first)){
      values = array.map(line=>{
        return `(${line.map(d=>toLiteral(d, this.$escape)).join(',')})`
      })
    }else{
      const names = Object.keys(first)
      this.$f = names
      values = array.map(obj=>{
        return `(${names.map(n=>toLiteral(obj[n], this.$escape)).join(',')})`
      }) 
    }
    const q = fmt(
      'INSERT INTO %s(%s) %s VALUES %s',
      this.$t,
      this.$f.join(','),
      this.$buildOutput('INSERTED'),
      values.join(',')
    )
    return q
  }
  insertAll(array, clbk){
    const queries = toChunck1000(array)
    const result = []
    const output = this.$out
    return queries.reduce(async (before, currentArray)=>{
      await before
      return this.$query('$buildInsertAll', clbk, currentArray)
        .then(res=>{
          if(output){
            result.push(...res)
          }
        })
    }, Promise.resolve([]))
      .then(()=>{
        if(clbk){
          return clbk(result)
        }
        return result
      })
  }
  sub(q){
    this.$sub = q
    return this
  }
  $query(method, clbk, arg){
    const qstr = this[method](arg)
    if(this.$debug){
      this.$p.emit(QUERY,qstr)
    }
    const p = this.$req.query(qstr)
      .then(rs=>rs.recordset)
    if(clbk){
      return p.then(clbk)
    }
    return p
  }
  $buildUpdate(){
    let valueSet = this.$f.map((f,ind)=>{
      return `${f} = ${toLiteral(this.$v[ind], this.$escape)}`
    }).join(',')
    return fmt(
      UPDATE_TEMP,
      this.$t,
      valueSet,
      this.$buildOutput('INSERTED'),
      this.$buildUpdateJoin(),
      this.$buildWhere()
    )
  }
  $buildUpdateJoin(){
    if(!this.$j){
      return this.$t
    }
    return this.$j.map(j=>{
      return `${this.$t} ${this.$a} ${j.joinType} JOIN ${j.tbl} ${j.tblAlias} ON ${j.condition}`
    }).join(' ')
  }
  $buildDelete(){
    return fmt(
      DELETE_TEMP,
      this.$t,
      this.$buildOutput('DELETED'),
      this.$buildWhere()
    )
  }
  update(clbk){
    if(!this.$w){
      throw new Error(message.REQUIRE_WHERE_FOR_UPDATE)
    }
    return this.$query('$buildUpdate', clbk)
  }
  updateOne(clbk){
    this.$out = true
    return this.update(true)
      .then(rs=>{
        if(rs.length !== 1){
          throw new Error(`updateOne return record count is ${rs.length}. Expected 1 record`)
        }
        let [first] = rs
        if(clbk){
          return clbk(first)
        }
        return first
      })
  }
  delete(clbk){
    return this.$query('$buildDelete', clbk)
  }
}
module.exports = mssqlQ


function toChunck1000(ary){
  const result = []
  for(let i = 0, l = ary.length; i < l ;i += 1000){
    result.push(ary.splice(0, 1000))
  }
  return result
}