#!/bin/bash
APP_HOME=$(cd "${0%/*}" > /dev/null && pwd -P)
JAVA_HOME="${JAVA_HOME:-/home/paperclip/.local/jdk/jdk-17.0.10+7}"
exec "$JAVA_HOME/bin/java" -Xmx64m -Xms64m -Dorg.gradle.appname=gradlew -classpath "$APP_HOME/gradle/wrapper/gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain "$@"
