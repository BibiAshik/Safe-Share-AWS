# syntax=docker/dockerfile:1.7

# Stage 1: Build the application using Maven
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
ENV MAVEN_OPTS="-Dhttps.protocols=TLSv1.2 -Djdk.tls.client.protocols=TLSv1.2"
COPY pom.xml .
COPY src ./src
# Build the application and run tests before creating the image
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -Dhttps.protocols=TLSv1.2 -Djdk.tls.client.protocols=TLSv1.2 -Dmaven.wagon.http.retryHandler.count=3 clean package

# Stage 2: Create the minimal runtime image
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Create a volume for temp files
VOLUME /tmp

# Copy the built jar from the build stage
COPY --from=build /app/target/safeshare-1.0.0.jar app.jar

# Expose the application port
EXPOSE 8080

# Run the jar file, setting the active profile to 'prod'
ENTRYPOINT ["java","-jar","/app/app.jar"]
