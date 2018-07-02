let expect = require('expect')
var mssqlQ = require('../index.js')

describe('sql module test',function(){
  this.timeout(75000)
  let testDbInfo = {
    server:'10.26.196.242',
    user:'dev',
    password:'sys_dev',
    database:'test',
    options:{
      useUTC:false
    }
  }
  let con = null 
  before((clbk)=>{
    con = new mssqlQ(testDbInfo)
    con.connect().then(()=>{
      clbk()
    })
    con.on('query', console.log)
  })
  after(()=>{
    con.close()
  })
  it('create select query', ()=>{
    return con.q('sample_data')
      .fields('id', 'name', 'birth')
      .select()
      .then(res=>{
        expect(res).toBeA('array')
      }).catch(console.error)
  })
  let insIds = []
  it('insert query', ()=>{
    return con.q('sample_data')
      .fields('name', 'birth')
      .output(true)
      .values('mz y', '1982/06/30').insertOne()
      .then(r=>{
        insIds.push(r.id)
        expect(r.name).toBeA('string')
      })
  })
  it('insert use map', ()=>{
    return con.q('sample_data')
      .map({
        name:'MIZO',
        birth:new Date()
      }).output(true).insertOne()
      .then(r=>{
        insIds.push(r.id)
        expect(r.name).toBeA('string')
      })
  })
  it('select with where query return a record',()=>{
    return con.q('sample_data')
      .where({name:'MIZO'})
      .selectOne()
      .then(r=>{
        expect(r.name).toBe('MIZO')
      })
  })
  it('select with top 1 query', ()=>{
    return con.q('sample_data')
      .top(1)
      .select()
      .then(rs=>  expect(rs.length).toBe(1))
  })
  it('select with join query', ()=>{
    return con.q('sample_data', 's')
      .join('inner', 'sample_child', 's.id = c.parent_id', 'c')
      .fieldsOf('s', 'id')
      .fieldsOf('c', 'id')
      .top(10)
      .select(rs=>{
        expect(rs).toBeA('array')
      })
  })
  it('update inserted ',()=>{
    return con.q('sample_data')
      .output(true)
      .where({
        id:['in',insIds]
      }).map({
        name:'MY',
        birth:'@GETDATE()'
      })
      .update()
      .then(updated=> expect(updated.length).toBe(2))
  })
  it('update join', ()=>{
    return con.q('sample_data')
      .output(true)
      .map({
        name:'@c.id'
      })
      .where({
        'sample_data.id':10000 
      }).join('INNER', 'sample_child', 'sample_data.id = c.id', 'c')
      .update()
  })
  it('insert child', ()=>{
    return con.q('sample_child')
      .fields('parent_id', 'datum')
      .sub(con.q('sample_data').fields('id', 'name'))
      .output(true)
      .insert()
  })
  it('join join test', ()=>{
    return con.q('sample_data', 'd')
      .join('INNER', 'sample_child', 's.parent_id = d.id', 's')
      .join('INNER', 'sample_child', 's2.parent_id = d.id', 's2')
      .select()
      .then(r=>{
        expect(r.length).toBeGreaterThanOrEqualTo(2)
      })
  })
  it('delete children', ()=>{
    return con.q('sample_child').where({1:1})
      .delete()
  })
  it('delete sampledata',()=>{
    return con.q('sample_data').where({1:1})
      .delete()
  })
  it('insert all test', ()=>{
    return con.q('sample_data')
      .output(true)
      .fields('name', 'birth')
      .insertAll([
        ['a', new Date()],
        ['b', new Date()],
        ['c', new Date()],
        ['d', new Date()]
      ]).then(ret=>{
        expect(ret.length).toBe(4)
      })
  })
  it('insert all object test', ()=>{
    return con.q('sample_data')
      .output(true)
      .insertAll([
        {name:'ii', birth:new Date()},
        {name:'hh', birth:new Date()},
        {name:'gg', birth:new Date()},
        {name:'ff', birth:new Date()},
        {name:'ee', birth:new Date()},
        {name:'dd', birth:new Date()},
        {name:'bb', birth:new Date()},
        {name:'cc', birth:new Date()},
        {name:'aa', birth:new Date()}
      ]).then((rs)=>{
        expect(rs.length).toBe(9)
      })
  })
  it('complex where select', ()=>{
    return con.q('sample_data')
      .fields('name','birth')
      .where([
        {
          name:'a',
          id:100
        },
        {
          name:'b',
          id:100
        }
      ])
      .select()
      .then(r=> expect(r).toBeA('array'))
  })
  it('plain where', ()=>{
    return con.q('sample_data')
      .where('id >= 1000')
      .where('id <= 2000')
      .select()
      .then(r=>{
        expect(r).toBeA('array')
      })
  })
  it('complex where', ()=>{
    return con.q('sample_data')
      .where([
        'id >= 1000',
        'id <= 10000'
      ])
      .where([
        'id <= 10000',
        {
          name:'hogehoge',
          create_at:new Date()
        }
      ])
      .where({name:'miz'})
      .simpleWhere('name', 'like', 'm%')
      .select()
  })
  it('insert all over 1000 [object]', async ()=>{
    const data = []
    for(let i = 0, l = 2500; i < l ; i++){
      data.push({
        name:'name' + i
      })
    }
    await con.q('sample_data')
      .insertAll(data)
  })
  it('insert all over 1000 [Array]', async ()=>{
    const data = []
    for(let i = 0, l = 2500; i < l ; i++){
      data.push({
        name:'name' + i
      })
    }
    await con.q('sample_data')
      .insertAll(data)
  })
  it('select is null condition',async ()=>{
    await con.q('sample_data')
      .where({birth:null})
      .select()
  })
  it('transaction test', ()=>{
    var trans = con.getTrans()
    return trans.begin()
      .then(()=>{
        return trans.q('sample_data')
          .output(true)
          .simpleWhere('name', 'like', '%')
          .delete()
      })
      .then(deleted=>{
        expect(deleted.length).toBeMoreThan(3)
        return trans.commit()
      })
  })
})