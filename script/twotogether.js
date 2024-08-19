(async () => {
  try {
    console.log('Starting script execution...');

    const accounts = await web3.eth.getAccounts();
    console.log('Accounts loaded:', accounts.length, 'accounts available');

    const deployerAccount = accounts[0];
    const usableAccounts = accounts.filter(account => account !== deployerAccount);

    // Deploy CommunityGovernanceProfiles contract
    console.log('Deploying CommunityGovernanceProfiles contract...');
    const profilesMetadataContent = await remix.call('fileManager', 'getFile', 'contracts/artifacts/CommunityGovernanceProfiles.json');
    const profilesMetadata = JSON.parse(profilesMetadataContent);

    let profilesContract = new web3.eth.Contract(profilesMetadata.abi);
    profilesContract = profilesContract.deploy({
      data: profilesMetadata.data.bytecode.object,
      arguments: []
    });

    const profilesGasEstimate = await profilesContract.estimateGas({ from: deployerAccount });
    let communityGovernanceProfiles = await profilesContract.send({
      from: deployerAccount,
      gas: Math.max(profilesGasEstimate * 2, 8000000),
      gasPrice: '30000000000'
    });

    console.log('CommunityGovernanceProfiles deployed at:', communityGovernanceProfiles.options.address);

    // Configure CommunityGovernanceProfiles
    console.log('Configuring CommunityGovernanceProfiles...');

    // Create three communities
    const communities = [
      { name: "Tech Enthusiasts", description: "A community for tech lovers", imageUrl: "https://example.com/tech.jpg" },
      { name: "Green Earth", description: "Environmentally conscious group", imageUrl: "https://example.com/earth.jpg" },
      { name: "Book Club", description: "For avid readers", imageUrl: "https://example.com/book.jpg" }
    ];

    for (let i = 0; i < communities.length; i++) {
      const { name, description, imageUrl } = communities[i];
      await communityGovernanceProfiles.methods.createCommunity(name, description, imageUrl).send({ from: deployerAccount, gas: 3000000 });
      console.log(`Community created: ${name}`);
    }

    // Add members to each community
    const membersPerCommunity = usableAccounts.length;
    const membersNeedingApproval = {};

    for (let communityId = 1; communityId <= communities.length; communityId++) {
      membersNeedingApproval[communityId] = [];
      
      for (let j = 0; j < membersPerCommunity; j++) {
        const memberAccount = usableAccounts[j];
        const username = `User${communityId}_${j + 1}`;
        const userDescription = `Member of community ${communityId}`;
        const profilePicUrl = `https://example.com/user${communityId}_${j + 1}.jpg`;

        try {
          await communityGovernanceProfiles.methods.createProfileAndJoinCommunity(
            username,
            userDescription,
            profilePicUrl,
            communityId
          ).send({ from: memberAccount, gas: 3000000 });

          console.log(`Added ${username} to community ${communityId}`);

          // Members after the 5th need approval
          if (j >= 5) {
            membersNeedingApproval[communityId].push(memberAccount);
          }
        } catch (error) {
          console.log(`Failed to add ${username} to community ${communityId}. Reason: ${error.message}`);
        }
      }
    }

    // Approve users
    for (let communityId = 1; communityId <= communities.length; communityId++) {
      const approvers = usableAccounts.slice(0, 2); // Use the first two accounts as approvers
      
      for (const memberToApprove of membersNeedingApproval[communityId]) {
        for (const approver of approvers) {
          try {
            await communityGovernanceProfiles.methods.approveUser(memberToApprove, communityId)
              .send({ from: approver, gas: 3000000 });
            console.log(`User ${memberToApprove} approved by ${approver} in community ${communityId}`);
          } catch (error) {
            console.log(`Failed to approve user ${memberToApprove} by ${approver} in community ${communityId}. Reason: ${error.message}`);
          }
        }
        
        // Check if the user is now approved
        const userData = await communityGovernanceProfiles.methods.getUserCommunityData(memberToApprove, communityId).call();
        console.log(`User ${memberToApprove} approval status in community ${communityId}: ${userData[3]}`);
      }
    }

    // Deploy CommunityGovernanceContributions contract
    console.log('Deploying CommunityGovernanceContributions contract...');
    const contributionsMetadataContent = await remix.call('fileManager', 'getFile', 'contracts/artifacts/CommunityGovernanceContributions.json');
    const contributionsMetadata = JSON.parse(contributionsMetadataContent);

    let contributionsContract = new web3.eth.Contract(contributionsMetadata.abi);
    contributionsContract = contributionsContract.deploy({
      data: contributionsMetadata.data.bytecode.object,
      arguments: [communityGovernanceProfiles.options.address]
    });

    const contributionsGasEstimate = await contributionsContract.estimateGas({ from: deployerAccount });
    let communityGovernanceContributions = await contributionsContract.send({
      from: deployerAccount,
      gas: Math.max(contributionsGasEstimate * 2, 8000000),
      gasPrice: '30000000000'
    });

    console.log('CommunityGovernanceContributions deployed at:', communityGovernanceContributions.options.address);

    // Function to submit contributions
    async function submitContributions(communityId, targetContributions) {
      console.log(`\nSubmitting contributions for community ${communityId}`);
      const communityMembers = (await communityGovernanceProfiles.methods.getCommunityMembers(communityId).call())[0];
      let successfulContributions = 0;

      for (let i = 0; i < communityMembers.length && successfulContributions < targetContributions; i++) {
        const contributor = communityMembers[i];
        if (contributor === deployerAccount) continue; // Skip the deployer account

        const contribution = [{
          name: `Contribution ${successfulContributions + 1}`,
          description: `Description for contribution ${successfulContributions + 1}`,
          links: [`https://example.com/contribution${successfulContributions + 1}`]
        }];

        try {
          // Check if the user is approved in the community
          const userData = await communityGovernanceProfiles.methods.getUserCommunityData(contributor, communityId).call();
          if (!userData[3]) {
            console.log(`Skipping contribution for ${contributor} as they are not approved in the community.`);
            continue;
          }

          await communityGovernanceContributions.methods.submitContributions(communityId, contribution)
            .send({ from: contributor, gas: 3000000 });
          console.log(`Contribution submitted by ${contributor}`);
          successfulContributions++;
        } catch (error) {
          console.log(`Failed to submit contribution for ${contributor}. Reason: ${error.message}`);
          // Continue with the next contributor
        }
      }

      console.log(`Successfully submitted ${successfulContributions} contributions for community ${communityId}`);
    }

    // Submit contributions for each community
    await submitContributions(1, 7);
    await submitContributions(2, 16);
    await submitContributions(3, 23);

    // Function to create groups and log their details
    async function createAndLogGroups(communityId) {
      console.log(`\nCreating groups for community ${communityId}:`);
      
      try {
        await communityGovernanceContributions.methods.createGroupsForCurrentWeek(communityId).send({ from: deployerAccount, gas: 3000000 });
        
        // Log group creation details
        const groupCount = await communityGovernanceContributions.methods.getGroupCount().call();
        console.log(`Total groups created: ${groupCount}`);

        const detailedInfo = await communityGovernanceContributions.methods.getDetailedGroupInfo().call();
        const groupIds = detailedInfo[0];
        const groupSizes = detailedInfo[1];

        for (let i = 0; i < groupCount; i++) {
          console.log(`Group ${groupIds[i]}: ${groupSizes[i]} members`);
          
          console.log('Members:');
          const members = await communityGovernanceContributions.methods.getGroupMembers(i).call();
          members.forEach(member => console.log(`  ${member}`));
        }

        const lastRoomSizes = await communityGovernanceContributions.methods.getLastRoomSizes().call();
        console.log('Last room sizes:', lastRoomSizes);

        // Get and log weekly contributors
        const eventCount = await communityGovernanceProfiles.methods.getCommunityProfile(communityId).call();
        const currentWeek = eventCount[4];
        const weeklyContributors = await communityGovernanceContributions.methods.getWeeklyContributors(communityId, currentWeek).call();
        console.log(`Weekly contributors for community ${communityId}, week ${currentWeek}:`, weeklyContributors);
        console.log(`Number of contributors: ${weeklyContributors.length}`);
      } catch (error) {
        console.log(`Failed to create groups for community ${communityId}. Reason: ${error.message}`);
      }
    }

    // Create groups for each community
    for (let communityId = 1; communityId <= communities.length; communityId++) {
      await createAndLogGroups(communityId);
    }

    // Function to submit rankings
    async function submitRankings(communityId, weekNumber, groupId) {
      console.log(`\nSubmitting rankings for community ${communityId}, week ${weekNumber}, group ${groupId}`);
      const groupMembers = await communityGovernanceContributions.methods.getGroupMembers(groupId).call();

      for (let i = 0; i < groupMembers.length; i++) {
        const ranker = groupMembers[i];
        if (ranker === deployerAccount) continue; // Skip the deployer account

        // Create a random ranking of group members (excluding the ranker)
        let ranking = groupMembers.filter(member => member !== ranker);
        ranking.sort(() => Math.random() - 0.5);
        ranking.splice(Math.floor(Math.random() * ranking.length), 0, ranker); // Insert ranker at a random position

        try {
          await communityGovernanceContributions.methods.submitRanking(communityId, weekNumber, groupId, ranking)
            .send({ from: ranker, gas: 3000000 });
          console.log(`Ranking submitted by ${ranker}:`, ranking);
        } catch (error) {
          console.log(`Failed to submit ranking for ${ranker}. Reason: ${error.message}`);
        }
      }
    }

  async function determineGroupConsensus(communityId, weekNumber, groupId) {
  console.log(`\nDetermining consensus for community ${communityId}, week ${weekNumber}, group ${groupId}`);
  try {
    // Fetch all rankings for this group
    const groupMembers = await communityGovernanceContributions.methods.getGroupMembers(groupId).call();
    console.log('Group Members:', groupMembers);
    
    console.log('Individual Rankings:');
    for (const member of groupMembers) {
      const ranking = await communityGovernanceContributions.methods.getRanking(communityId, weekNumber, groupId, member).call();
      console.log(`${member}: ${ranking.length > 0 ? ranking.join(', ') : 'No ranking submitted'}`);
    }

    // Call determineConsensus
    await communityGovernanceContributions.methods.determineConsensus(communityId, weekNumber, groupId)
      .send({ from: deployerAccount, gas: 3000000 });
    
    // Fetch transient scores
    const [members, scores] = await communityGovernanceContributions.methods.getTransientScores(communityId, weekNumber, groupId).call();
    console.log('Transient Scores:');
    for (let i = 0; i < members.length; i++) {
      const score = BigInt(scores[i]);
      const averageRanking = Number(score / BigInt(1000));
      const consensusTerm = Number(score % BigInt(1000)) / 1000;
      console.log(`${members[i]}: Average Ranking: ${averageRanking.toFixed(3)}, Consensus Term: ${consensusTerm.toFixed(3)}`);
    }

    // Fetch and log the final consensus ranking
    const consensusRanking = await communityGovernanceContributions.methods.getConsensusRanking(communityId, weekNumber, groupId).call();
    if (consensusRanking && consensusRanking.rankedAddresses && consensusRanking.rankedAddresses.length > 0) {
      console.log('Final Consensus Ranking:', consensusRanking.rankedAddresses.join(', '));
    } else {
      console.log('No consensus ranking available');
    }
} catch (e) {
  console.error('Error:', e.message);
  console.error('Error stack:', e.stack);
}
})();