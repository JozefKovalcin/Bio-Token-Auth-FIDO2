FROM gradle:8.14.3-jdk21 AS build
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /home/gradle/project
# The official maintained Android verifier, pinned to the v0.4 source revision.
RUN git clone https://github.com/android/keyattestation.git upstream && cd upstream && git checkout 621149c4ebaeeea844d6f43098687c73c4d370a3 && rm -rf .git
COPY settings.gradle.kts build.gradle.kts ./
COPY src ./src
RUN gradle --no-daemon test installDist

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /home/gradle/project/build/install/bio-attestation /app
USER 10001:10001
EXPOSE 8081
ENTRYPOINT ["/app/bin/bio-attestation"]
