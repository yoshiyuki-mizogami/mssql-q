# mssql-q

> node mssql クエリ生成モジュール

バージョン1系とは互換性有りません。
主な変更

* field => fields
* join タイプは必須へ(INNERの場合でも省略不可)
* fieldsを与えない場合デフォルトで'*'とするように
* whereに渡すパラメータにより柔軟な条件設定が可能になった
* update + JOIN が可能に
* クエリのデバッグは、イベントを利用


`IMPORTANT` Node7.0.0 <= でしかテストしてません
## install
```sh
  npm install -S git+https://github.com/yoshiyuki-mizogami/mssql-q.git
```

グループのGitBucketURLにgit+をつけることでインストールできます。

### Basic Usage
```javascript
  let mssqlQ = require('mssql-q')
  let con = new mssqlQ({
    server:'192.168.1.1',
    user:'login_user',
    password:'login_password',
    database:'sample',
    options:{
      useUTC:false
    }
  })
  con.connect()
  .then(()=>{
    con.q('sample_table')
    .fields('filed_a', 'field_b')
    .select()
    .then(rs=>{
      //rs => response by  "SELECT field_a, field_b FROM sample_table"
      console.log(rs)
    })
  })
```

## Connection
> 接続管理クラス

### `new mssqQ([options])`
```
  let con = new mssqlQ({/*connetion info*/})
```
* `options` Object 
  * `server` String サーバ名(IPアドレス)
  * `user` String ログインユーザ名
  * `login` String ログインパスワード
  * `database` String データベース名
  * `options` Object (optional) オプション設定
    * `useUTC` 標準時間利用 `true` by default

基本的な接続のオプションについて書いているが、
接続情報は基本的に内部利用の[mssql](https://www.npmjs.com/package/mssql)に渡しているだけなので、
詳しくは[mssql](https://www.npmjs.com/package/mssql#connectionpool)を参照

### Events

### `query`
```
  Connection.on('query', queryString=> console.log(queryString))
```
クエリ発行の都度発火  
主にデバッグ用なので、
optionでdebugをtrueにしなければ発火しないので注意

### Instance Methods
  
### `Connection.connect()`
* `returns` Promise resolve when connected

### `Connection.setConfig(options)
* `options` Object
  * `debug` Boolean default `false` trueにすることでqueryイベントを発火するようになる
  * `escape` String default `"@"` この文字を頭につけることで、SQL関数などをそのまま送る事ができる詳しくはqueryの項で
  * `noLock` Boolean default `false` trueにすると、全てのクエリのテーブルに(NOLOCK)ヒントをつける。
  * `output` Boolean default `false` trueにすると、デフォルトでOUTPUT句が付く
  * `blankToNull` Boolean default `true` 通常、空文字はnullとしてクエリが作られるが、falseにすると空文字そのものになる。

### `Connection.close()`
DB接続を切る

### `Connection.plain(query)`
* `query` String SQL文字列
* `returns` Promise(recordsets)
  
SQLテキストをそのまま送信し、レコードセットを受け取る

### `Connection.getTrans()`
* `returns` 

### `Connection.query(table_name, [table_alias])`)
* `table_name` String テーブル名
* `table_alias` String(optional) テーブル別名
* `returns` [Query](#Query)

```javascript
  con.query('some_tbl', 's')
  .select()
  //=>SELECT * from some_tbl s
```
### `Connection.q`

queryの別名。タイプを少なくしたいので

## `Query`
> Connection.queryで返されるクエリ生成オブジェクト

### Instance Methods

### `Query.fields(...fields)`
* `returns` this

クエリの列を定義。
fieldsを与えない場合、デフォルトで'*'となるので必須ではない(1系と違う)

```javascript
  con.query('some_table')
  .fields('acol', 'bcol', 'ccol')
  .select()
  .then(console.log)
  //=> SELECT acol, bcol, ccol FROM some_table
```

### `Query.fieldsOf(tblname, ...fields)`
テーブルを指定してfield定義する
``` javascript
  co.query('some_table', 'stbl')
  .fieldsOf('stbl', 'acol', 'bcol')
  .select()
  .then(console.log)
  //=> SELECT stbl.acol, stbl.bcol FROM some_table stbl
```

### `Query.clearFields(...fields)`
現在のfield情報をクリアして項目を定義。クリアされる以外はfieldsと同等

### `Query.select()`
* `returns` Promise resolve when responsed recordset
  * resolve(recordset)

### `Query.insert()`
* `returns` Promise resolve when responsed recordset
  * resolve(recordset)
  outputをtrueにしなければレコードセットは取得できない(updateも同様)

### `Query.insertOne()`
  * `returns` Promise resolve when responsed a record
  一行のみのインサートに使用。Promiseで返される値は配列ではなく一行分のレコードオブジェクト
  outputは自動的にtrueとなる。   
  複数のインサートが行われるとreject(クエリ自体は投げられてしまうので注意)

### `Query.insertAll(records array<object>)`
* `returns` Promise resolve when responsed recordset
  * resolve(recordset)

```javascript
  /*insert array<array>*/
  con.query('some_table')
  .fields('fielda', 'fieldb')
  .insert([
    ['astring1', 'bstring1'],
    ['astring2', 'bstring2']
  ])
  /*insert array<object>*/
  con.query('some_table')
  .insert([
    {fielda:'astring1', fieldb:'bstring1'},
    {fielda:'astring2', fieldb:'bstring2'}
  ])

```
  現状上限1000件まで。時間できたら直します。
  
### `Query.update()`
* `returns` Promise resolve when responsed recordset
  * resolve(recordset)

  `IMPORTANT`: update時には、必ず何らかのwhereによる条件を与えなければrejectされます

### `Query.updateOne()`
* `returns` Promise resolve when responsed recordset
  一行のみの更新処理。複数が更新されるとreject(クエリ自体は投げられてしまうので注意)

### `Query.values(...values)`
* `returns` this

クエリの値を定義
update,insert時に有効。selectでは単に無視される

```javascript
  con.query('some_table')
  .fields('acol')
  .values('A Value')
  .insert()
  // => INSERT INTO some_table(acol) VALUES('A Value') 

```

### `Query.clearValues(...values)`
現在のValuesをクリアして値を定義
クリアされる以外はvaluesと同等

### `Query.map(object)`
* `object` Object field,valueのペア

fieldsとvaluesをオブジェクトのkey:valueにしたがって同時にセットする

```javascript
  con.query('some_table')
  .map({
    name:'my-name',
    age:35
  }).insert()
  // => INSERT INTO some_table(name, age) VALUES('my-name', 35)
```

### `Query.where(whereParams)`
* `whereParams` Array|String|Object - where条件

```javascript
/* where from string */

con.query('some_table')
.map({name:'other name'})
.where("name = 'yamada'").update()

/*where from array<string>
 * 配列の要素毎にOR結合
*/
con.query('some_table')
.map({name:'other name'})
.where([
  "name = 'change target'",
  "name = 'will change'"
]).update()
//=> UPDATE some_table SET name = 'other name' WHERE (name = 'change target' OR name = 'will change')

/* where from object
 * オブジェクトの項目ごとにAND結合
*/
con.query('some_table')
.map({name:'other name'})
.where({
  name:'tanaka',
  age:10
}).update()
//=> UPDATE some_table SET name = 'other name' WHERE (name = 'tanaka' AND age = 10)
/* where from Array of Object
 * オブジェクトをAND結合したものをOR結合
 */
con.query('some_table')
.map({name:'new name'})
.where([
  {
    name:'tanaka',
    age:10
  },
  {
    name:'yamada',
    age:15
  }
]).update()
//=> UPDATE some_table SET name = 'new name' WHERE
// ((name = 'tanaka' AND age = 10) OR (name = 'yamada' AND age = 15))

/* multiple where
 * 各whereをAND結合
*/
con.query('some_table')
.map({name:'new name'})
.where('10 <= age')
.where('age <= 20')
.update()
//=> UPDATE some_table SET name = 'new name' WHERE
// ((10 <= age) AND (age <= 20)) 
```

### `Query.clearWhere(whereParams)`
whereの条件をクリアにして、新たにwhere条件をあたえる  
クリアされる以外はwhereと同じ

### `Query.simpleWhere(key, operator, value)`
* `key` String - フィールド名
* `operator` String - Sql 演算子
* `value ` String|Date|Number 値

```javascript
  con.query('test_tbl', 't')
  .simpleWhere('id' ,'=', 15)
  .simpleWhere('name', 'like', 'S%')
  .select()
  //=> SELECT * from test_tbl t WHERE (id = 15) AND (name LIKE 'S%')
```

### `Query.output( bool )`
* `bool` Boolean - OUTPUT句の利用有無
グローバル設定のoutputをクエリ毎に上書き設定可能

## Transaction Connection
> トランザクション用コネクションクラス

```javascript
  var trans = Connection.getTrans()
```

トランザクションのbegin,commit rolback以外は通常のコネクションと同様につかう

## Instance Methods

### Trans.begin() , Trans.commit(), Trans.rollback()
* `returns` Promise - resolve when began transaction

```javascript
  trans.begin()
  .then(()=>{
    return trans.query('a_tbl').map({name:'a name'}).insert()
  })
  .then(()=>{
    return trans.commit()
  })
  .catch(e=>{
    return trans.rollback()
  })
```

#＃ Promiseのショートカット

select, insert, update,deleteの継続処理は全てコールバックでも渡せるようになってます。さらにPromiseを返すようになっているので、
```javascript
  con.q('test_tbl')
  .select()
  .then((rs)=>{
    console.log(rs)
  })
```
は
```javascript
  con.q('test_tbl')
  .select((rs)=>{
    console.log(rs)
  }).then
```
のように短縮できます
