const asyncHandler = require('express-async-handler');
const Workspace = require('../models/workspaceModel');
const User = require('../models/userModel');
const Chat = require('../models/chatModel');

//@description     Create a new workspace
//@route           POST /api/workspace
//@access          Protected

// Controller function to create a workspace and associated groups
const createWorkspace = asyncHandler(async (req, res) => {
  const { name, roles } = req.body;
  const user = req.user;

  if (!name || !roles || roles.length === 0) {
    res.status(400);
    throw new Error('Please provide workspace name and roles.');
  }

  // Helper function to generate all combinations of roles
  const getCombinations = (roles) => {
    const result = [];
    const f = (prefix, roles) => {
      for (let i = 0; i < roles.length; i++) {
        result.push([...prefix, roles[i]]);
        f([...prefix, roles[i]], roles.slice(i + 1));
      }
    };
    f([], roles);
    return result;
  };

  // Create the workspace
  const workspace = await Workspace.create({
    workspaceName: name,
    createdBy: user._id,
    roles: roles.map(role => ({ roleName: role, users: [] })),
    users: [user._id] // Add the creator to the workspace's users list
  });

  // Create groups based on roles and their combinations
  const roleCombinations = getCombinations(roles);
  const groups = roleCombinations.map(combination => ({
    chatName: combination.join('+'), // Using combination of role names as the group name
    isGroupChat: true,
    users: [user._id], // Add the creator as a member
    groupAdmin: user._id,
    workspace: workspace._id // Link the group to the workspace
  }));

  // Save groups to database
  const createdGroups = await Chat.insertMany(groups);

  // Update workspace with the created groups
  workspace.groups = createdGroups.map(group => group._id);
  await workspace.save();

  // Add workspace to the user's list of workspaces
  const userDoc = await User.findById(user._id);
  if (!userDoc.workspaces.includes(workspace._id)) {
    userDoc.workspaces.push(workspace._id);
    await userDoc.save();
  }

  res.status(201).json({
    workspace,
    groups: createdGroups
  });
});
  


//@description     Add role to workspace
//@route           POST /api/workspace/:id/role
//@access          Protected
// Controller function to add a role to an existing workspace
const addRole = asyncHandler(async (req, res) => {
    const { roleName } = req.body;
    const workspace = await Workspace.findById(req.params.id);
  
    if (!workspace) {
      res.status(404);
      throw new Error('Workspace not found');
    }
  
    workspace.roles.push({ roleName, users: [] });
    await workspace.save();
  
    res.status(201).json(workspace);
  });

//@description     Get roles in a workspace
//@route           GET /api/workspace/:id/roles
//@access          Protected
const getRoles = asyncHandler(async (req, res) => {
    const workspace = await Workspace.findById(req.params.id);
  
    if (!workspace) {
      res.status(404);
      throw new Error('Workspace not found');
    }
  
    res.status(200).json(workspace.roles);
  });
  

// Controller function to join a workspace
const joinWorkspace = asyncHandler(async (req, res) => {
  const { workspaceId, groupId } = req.body;
  const user = req.user;

  if (!workspaceId || !groupId) {
    res.status(400);
    throw new Error('Please provide workspace ID and group ID.');
  }

  // Find the workspace by ID
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    res.status(404);
    throw new Error('Workspace not found.');
  }

  // Find the group by ID
  const group = await Chat.findById(groupId);
  if (!group) {
    res.status(404);
    throw new Error('Group not found.');
  }

  // Check if the group is part of the workspace
  const role = workspace.roles.find(r => r.roleName === group.chatName);
  if (!role) {
    res.status(400);
    throw new Error('Group does not match any role in the workspace.');
  }

  // Add user to the workspace's users list if not already added
  if (!workspace.users.includes(user._id)) {
    workspace.users.push(user._id);
  }

  // Add user to the role's users list if not already added
  if (!role.users.includes(user._id)) {
    role.users.push(user._id);
  }

  // Find all groups that include the roleName
  const groups = await Chat.find({
    workspace: workspaceId,
    chatName: new RegExp(`\\b${role.roleName}\\b`) // Regex to match groups containing the roleName
  });

  // Add user to each group if not already added
  for (const group of groups) {
    if (!group.users.includes(user._id)) {
      group.users.push(user._id);
      await group.save();
    }
  }

  // Save the workspace
  await workspace.save();

  // Add workspace to the user's list of workspaces if not already added
  const userDoc = await User.findById(user._id);
  if (!userDoc.workspaces.includes(workspace._id)) {
    userDoc.workspaces.push(workspace._id);
    await userDoc.save();
  }

  res.status(200).json({
    message: 'Successfully joined the workspace and relevant groups.',
    workspace,
    groups
  });
});

const getUserWorkspaces = asyncHandler(async (req, res) => {
    const user = req.user;  

    const workspaces = await Workspace.find({ users: user._id });
    res.status(200).json(workspaces);
});


const getGroups = asyncHandler(async (req, res) => {
    const workspaceId = req.params.id;

    const workspace = await Workspace.findById(workspaceId).populate('groups');
    console.log("workspace",workspace);
    console.log("groups",workspace.groups);

  
    if (!workspace) {
      res.status(404);
      throw new Error('Workspace not found');
    }
  
    res.status(200).json(workspace.groups);
});

const deleteAllWorkspaces = asyncHandler(async (req, res) => {
    try {
      await Workspace.deleteMany({});
      res.status(200).json({ message: 'All workspaces have been deleted successfully.' });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete workspaces', error: error.message });
    }
  });

module.exports =
    { createWorkspace,
     addRole, 
     getRoles,
       joinWorkspace,
       getUserWorkspaces,
       getGroups ,
    deleteAllWorkspaces};
