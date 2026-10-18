# -*- coding: utf-8 -*-
"""生成示例日志目录（用于截图、README 演示、贡献者自测）。
含：UTF-8 日志 / GBK 中文日志 / 超长行 JSONL / 子目录 / 二进制文件 / 无命中文件。
"""
import io
import os
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'examples', 'sample-logs'))


def w(rel, text, encoding='utf-8'):
    p = os.path.join(OUT, rel.replace('/', os.sep))
    d = os.path.dirname(p)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with io.open(p, 'w', encoding=encoding, newline='') as f:
        f.write(text)
    return p


def wb(rel, data):
    p = os.path.join(OUT, rel.replace('/', os.sep))
    d = os.path.dirname(p)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with io.open(p, 'wb') as f:
        f.write(data)
    return p


APP = [
    '2026-10-09 08:00:01 INFO  [main] service starting, pid=4821, version=3.14.2',
    '2026-10-09 08:00:01 INFO  [main] config loaded from ./conf/app.yml',
    '2026-10-09 08:00:02 INFO  [db] connection pool ready, size=16, latency=3ms',
    '2026-10-09 08:00:07 INFO  [http] listening on 0.0.0.0:8080 workers=8',
    '2026-10-09 08:00:09 INFO  [cache] warmup done, keys=1284',
    '2026-10-09 08:01:12 INFO  [order] created order id=SO202610090001 amount=199.00 user=u10086',
    '2026-10-09 08:01:13 ERROR [order] payment callback timeout after 3000ms, order=SO202610090001',
    '2026-10-09 08:01:13 WARN  [order] retrying payment callback (1/3)',
    '2026-10-09 08:01:16 ERROR [order] payment callback timeout after 3000ms, order=SO202610090001',
    '2026-10-09 08:01:16 WARN  [order] retrying payment callback (2/3)',
    '2026-10-09 08:01:19 ERROR [order] payment callback timeout after 3000ms, order=SO202610090001',
    '2026-10-09 08:01:19 ERROR [order] payment callback failed, giving up, order=SO202610090001',
    '2026-10-09 08:01:19 INFO  [order] order marked as PAY_FAILED',
    '2026-10-09 08:02:00 INFO  [order] created order id=SO202610090002 amount=58.50 user=u10087',
    '2026-10-09 08:02:01 INFO  [order] payment ok, order=SO202610090002',
    '2026-10-09 08:05:31 INFO  [sched] cron job "cleanup-tmp" started',
    '2026-10-09 08:05:33 INFO  [sched] cron job "cleanup-tmp" finished in 2081ms, removed=37',
    '2026-10-09 08:11:04 WARN  [db] slow query 1842ms: SELECT * FROM t_order WHERE status = ?',
    '2026-10-09 08:11:44 ERROR [db] deadlock detected, retrying transaction tx=0x7f3a',
    '2026-10-09 08:11:44 INFO  [db] transaction retried ok, tx=0x7f3a',
    '2026-10-09 08:20:00 INFO  [report] daily report generated, rows=120384',
    '2026-10-09 08:20:02 INFO  [report] uploaded to oss://reports/2026-10-09.csv',
    '2026-10-09 08:31:17 ERROR [http] 500 POST /api/v1/pay/callback 3001ms upstream=pay-gw',
    '2026-10-09 08:31:17 ERROR [http] stack: java.net.SocketTimeoutException: Read timed out',
    '2026-10-09 08:31:18 INFO  [http] request dumped to ./logs/failed/req-8f21.log',
    '2026-10-09 08:45:00 INFO  [health] ok cpu=12% mem=41% gc=0.8%',
    '2026-10-09 09:00:00 INFO  [sched] cron job "cleanup-tmp" started',
    '2026-10-09 09:00:01 INFO  [sched] cron job "cleanup-tmp" finished in 1955ms, removed=41',
    '2026-10-09 09:12:35 ERROR [order] payment callback timeout after 3000ms, order=SO202610090003',
    '2026-10-09 09:12:36 WARN  [order] retrying payment callback (1/3)',
    '2026-10-09 09:12:39 INFO  [order] payment retry ok, order=SO202610090003',
]
LONG_JSON = ('2026-10-09 09:15:00 INFO  [trace] {"traceId":"8f21c4a0b7e94d1fa1c2",'
             '"span":"POST /api/v1/pay/callback","upstream":"pay-gw","attempt":3,'
             '"headers":{"x-request-id":"a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",'
             '"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",'
             '"content-type":"application/json"},"payload":{"orderId":"SO202610090003","amount":199.00,'
             '"channel":"wechatpay","notifyTime":"2026-10-09T09:15:00+08:00","sign":"3f9a1c77e0b44d2aa8c1e6f0b7d9c4e2"},'
             '"result":{"code":"TIMEOUT","cost":3001,"retry":true}}')

GBK = [
    '2026-10-09 08:00:01 信息 [主程序] 服务启动完成，进程号=4821',
    '2026-10-09 08:00:05 信息 [数据库] 连接池就绪，连接数=16',
    '2026-10-09 08:01:13 错误 [订单] 支付回调超时，订单号=SO202610090001，耗时=3000毫秒',
    '2026-10-09 08:01:19 错误 [订单] 支付回调重试三次仍失败，订单标记为支付失败',
    '2026-10-09 08:11:44 警告 [数据库] 检测到死锁，事务回滚后重试 tx=0x7f3a',
    '2026-10-09 08:31:17 错误 [接口] 支付网关无响应，接口=/api/v1/pay/callback，耗时=3001毫秒',
    '2026-10-09 08:31:18 信息 [接口] 请求报文已转存 ./logs/failed/req-8f21.log',
    '2026-10-09 09:12:35 错误 [订单] 支付回调超时，订单号=SO202610090003',
    '2026-10-09 09:12:39 信息 [订单] 重试成功，订单号=SO202610090003',
    '2026-10-09 09:30:00 信息 [定时任务] 清理临时文件完成，删除 41 个文件',
    '2026-10-09 09:45:00 信息 [健康检查] 正常 cpu=12% 内存=41% 触发gc=0.8%',
    '2026-10-09 10:00:00 警告 [磁盘] 日志分区使用率 87%，请及时清理',
]

ARCHIVE = [
    '2026-09-30 23:58:00 INFO  [main] graceful shutdown requested',
    '2026-09-30 23:58:01 INFO  [main] flushed 3 pending tasks',
    '2026-09-30 23:59:59 ERROR [main] shutdown timeout, forcing exit after 60s',
    '2026-10-01 00:00:00 INFO  [main] service starting, pid=4711, version=3.14.1',
    '2026-10-01 00:00:03 INFO  [db] connection pool ready, size=16',
    '2026-10-01 00:03:22 WARN  [order] payment callback slow 2750ms, order=SO202609300017',
    '2026-10-01 00:03:25 INFO  [order] payment ok, order=SO202609300017',
]

METRICS = [
    '{"ts":"2026-10-09T08:00:00+08:00","name":"http.server.duration","tags":{"route":"/api/v1/pay/callback","method":"POST","status":"500"},"value":3001.2}',
    '{"ts":"2026-10-09T08:01:00+08:00","name":"jvm.gc.pause","tags":{"collector":"G1 Young Generation"},"value":8.4}',
    '{"ts":"2026-10-09T08:02:00+08:00","name":"db.pool.active","tags":{"pool":"primary"},"value":7}',
    '{"ts":"2026-10-09T08:03:00+08:00","name":"order.pay.fail.total","tags":{"channel":"wechatpay","reason":"timeout"},"value":4}',
]

README_TXT = (
    '这些是纯示例日志，用于演示「日志关键词提取器」。\n'
    '直接把整个 sample-logs 文件夹拖到页面里，或点「选择日志目录」选中它。\n'
    '试试这些关键词：ERROR、timeout、错误、超时、SO202610090001、payment。\n'
    'dump.bin 是二进制文件，应该被自动跳过并且不报错。\n'
)


def main():
    w('app-2026-10-09.log', '\n'.join(APP) + '\n' + LONG_JSON + '\n')
    w('service-erp-gbk.log', '\n'.join(GBK) + '\n', encoding='gbk')
    w('archive/old-2026-09.log', '\n'.join(ARCHIVE) + '\n')
    w('metrics.jsonl', '\n'.join(METRICS) + '\n')
    w('README.txt', README_TXT)
    blob = bytearray()
    for i in range(512):
        blob.append(0 if i % 7 == 0 else (i * 31 + 17) % 256)
    wb('dump.bin', bytes(blob))
    total = 0
    for root, _dirs, files in os.walk(OUT):
        for fn in files:
            total += 1
    print('demo dir: %s' % OUT)
    print('files: %d' % total)
    print('gbk bytes: %d' % os.path.getsize(os.path.join(OUT, 'service-erp-gbk.log')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
