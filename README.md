# install skupper 
```
oc new-project kafka-site1  
oc new-project kafka-site2
skupper init --enable-flow-collector --enable-console -n kafka-site1
skupper token create kafka-site1 -n kafka-site1 --token-type cert
skupper init --enable-flow-collector --enable-console -n kafka-site2
oc apply -f kafka-site1
skupper link status
```


## Install zookeeper
```

helm upgrade --install zookeeper ./  --values values-site1.yaml

skupper expose statefulset zookeeper --headless -n kafka-site1

helm upgrade --install zookeeper-site2 ./  --values values-site2.yaml

skupper expose statefulset zookeeper-site2 --headless -n kafka-site1

skupper expose service zookeeper --address zookeeper-skupper -n kafka-site1

skupper expose service zookeeper-site2 --address zookeeper-skupper -n kafka-site2

```

# install kafka
helm  upgrade --install kafka ./ --set zookeeper.enabled=false --set replicaCount=3 --set externalZookeeper.servers=zookeeper-skupper --values values-site1.yaml -n kafka-site1

helm  upgrade --install kafka ./ --set zookeeper.enabled=false --set replicaCount=3 --set externalZookeeper.servers=zookeeper-skupper --values values-site2.yaml -n kafka-site2

To connect a client to your Kafka, you need to create the 'client.properties' configuration files with the content below:
```
security.protocol=SASL_PLAINTEXT
sasl.mechanism=SCRAM-SHA-256
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required \
    username="admin" \
    password="$(kubectl get secret kafka-user-passwords --namespace kafka-site2 -o jsonpath='{.data.client-passwords}' | base64 -d | cut -d , -f 1)";
```
To create a pod that you can use as a Kafka client run the following commands:

```

    kubectl run kafka-client --restart='Never' --image docker.io/bitnami/kafka:3.6.0-debian-11-r0 --namespace kafka-site2 --command -- sleep infinity
    kubectl cp --namespace kafka-site2 /path/to/client.properties kafka-client:/tmp/client.properties
    kubectl exec --tty -i kafka-client --namespace kafka-site2 -- bash

    PRODUCER:
        kafka-console-producer.sh \
            --producer.config /tmp/client.properties \
            --broker-list kafka-broker-0.kafka-broker-headless.kafka-site2.svc.cluster.local:9092,kafka-broker-1.kafka-broker-headless.kafka-site2.svc.cluster.local:9092 \
            --topic test

    CONSUMER:
        kafka-console-consumer.sh \
            --consumer.config /tmp/client.properties \
            --bootstrap-server kafka.kafka-site2.svc.cluster.local:9092 \
            --topic test \
            --from-beginning

```
## Check zookeeper status
Run this command on all zookeeper pods to see the connection mode, it will be either observer, follower or leader 
```
$oc exec  -n kafka-site2 zookeeper-site2-1 --  /bin/bash -c "echo srvr | nc localhost 2181"
Zookeeper version: 3.9.1-1398af177833412e9ead6b9bb737dc9fd7418a45, built on 2023-10-04 09:54 UTC
Latency min/avg/max: 0/1.8257/26
Received: 2706
Sent: 2705
Connections: 2
Outstanding: 0
Zxid: 0x5000001d2
Mode: observer
Node count: 158

```
## Check Kafka status in zookeeper
```
$oc exec  -n kafka-site2 zookeeper-site2-1 --  /bin/bash -c "zkCli.sh -server zookeeper-skupper ls /brokers/ids"
/opt/bitnami/java/bin/java
Connecting to zookeeper-skupper

WATCHER::

WatchedEvent state:AuthFailed type:None path:null zxid: -1

WATCHER::

WatchedEvent state:SyncConnected type:None path:null zxid: -1
[100, 101, 200, 201]
```


## Setup k6 
```
kubectl run k6 --restart='Never' --image docker.io/mostafamoradian/xk6-kafka --namespace kafka --command -- sleep infinity

kubectl cp ./k6-kafka-string-test.js k6:/tmp/k6-kafka-string-test.js

k6 run --vus 50 --duration 15s /tmp/k6-kafka-string-test.js

oc exec  k6  --  /bin/sh -c "k6 run --vus 50 --duration 15s /tmp/k6-kafka-string-test.js"

```

## Notes for zookeeper

Update zoo_server variable in statefulset to match the namespace and the statefulset name being deployed.

minServerId value is the id for  zookeeper node myid starts with. if this is set to 1 for one deploy, set it to 11 for other deploy in other cluster. 

Follow this naming for helm releases, other wise zooservers in statefulset.yaml should be modified to match them

```
            - name: ZOO_SERVERS
              {{- $releaseNamespace := include "zookeeper.namespace" . }}
              value: zookeeper-0.zookeeper-headless.{{ $releaseNamespace }}.svc.cluster.local:2888:3888::1 zookeeper-1.zookeeper-headless.{{ $releaseNamespace }}.svc.cluster.local:2888:3888::2 zookeeper-2.zookeeper-headless.{{ $releaseNamespace }}.svc.cluster.local:2888:3888:observer::3 zookeeper-site2-0.zookeeper-site2-headless.{{ $releaseNamespace }}.svc.cluster.local:2888:3888::21 zookeeper-site2-1.zookeeper-site2-headless.{{ $releaseNamespace }}.svc.cluster.local:2888:3888:observer::22 

```